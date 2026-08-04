-- Completes step 7's "wired into the feed line" requirement. individual_cards_for_scope
-- now left-joins overlap_cache and returns any already-cached overlap phrase alongside
-- the base anonymized line. This is read-only and free — it does NOT trigger a new model
-- call for uncached pairs (that stays the job of the separate phrase-overlap edge
-- function, already built and verified). Returned as a separate column rather than
-- concatenated into `line` itself, so the client controls how the two are combined/styled.
drop function individual_cards_for_scope(uuid);

create function individual_cards_for_scope(p_scope_id uuid)
returns table (
  user_id uuid,
  line text,
  distance_band text,
  used_generic boolean,
  overlap_phrase text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scopes;
  v_population uuid[];
  v_caller uuid := auth.uid();
begin
  select * into v_scope from scopes where id = p_scope_id;
  if not found then
    raise exception 'No scope %', p_scope_id;
  end if;

  select array_agg(pop.user_id) into v_population from population_for_scope(p_scope_id) pop;

  return query
    select
      pa.user_id,
      assemble_line(
        pa.role_category, pa.industry, pa.stage, pa.school, pa.prior_employer, pa.tenure_band,
        supp.keep_industry, supp.keep_stage, supp.keep_school, supp.keep_prior_employer,
        supp.keep_tenure_band, supp.used_generic
      ),
      case
        when v_scope.kind = 'venue' then null
        when vs.location is null then null
        when st_distance(vs.location, v_scope.center) < 100 then 'in this building'
        when st_distance(vs.location, v_scope.center) < 1000 then 'nearby'
        else 'in the area'
      end,
      supp.used_generic,
      oc.phrase
    from profile_attributes pa
    left join visibility_sessions vs
      on vs.user_id = pa.user_id and vs.is_active = true and vs.expires_at > now()
    cross join lateral suppression_for_user(pa.user_id, v_population, 5) as supp
    left join overlap_cache oc
      on oc.user_a = least(v_caller, pa.user_id)
     and oc.user_b = greatest(v_caller, pa.user_id)
    where pa.user_id = any(v_population)
      and pa.user_id <> v_caller;
end;
$$;

grant execute on function individual_cards_for_scope(uuid) to authenticated;
