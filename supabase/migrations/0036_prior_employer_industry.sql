-- Founder decision: the anonymous card shown to strangers generalizes prior_employer down
-- to its industry/sector (e.g. "ex management consulting" instead of "ex Innosight") —
-- strictly more anonymous than the exact company name, so this is safe to layer on top of
-- the existing suppression check without touching it (if enough people already matched on
-- the exact company to pass k-anonymity, they trivially also match on the broader industry).
-- The exact company name is still shown on the person's own profile view and to
-- connections, via prior_employer — this column only affects what strangers see.
alter table profile_attributes add column prior_employer_industry text;

-- Render the generalized industry instead of the exact company name in the anonymous feed.
-- Falls back to showing nothing (rather than the exact name) if no classification exists
-- yet for this row — safer default than leaking the real company.
create or replace function individual_cards_for_scope(p_scope_id uuid)
returns table (
  user_id uuid,
  line text,
  role_category role_category,
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
  v_k_min int := get_k_min();
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
        pa.role_category, pa.industry, pa.stage, pa.school, pa.prior_employer_industry, pa.tenure_band,
        supp.keep_industry, supp.keep_stage, supp.keep_school, supp.keep_prior_employer,
        supp.keep_tenure_band, supp.used_generic, pa.tenure_years_exact
      ),
      pa.role_category,
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
    cross join lateral suppression_for_user(pa.user_id, v_population, v_k_min) as supp
    left join overlap_cache oc
      on oc.user_a = least(v_caller, pa.user_id)
     and oc.user_b = greatest(v_caller, pa.user_id)
    where pa.user_id = any(v_population)
      and pa.user_id <> v_caller;
end;
$$;
