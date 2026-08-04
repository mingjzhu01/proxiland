-- Spec v4, section 14 step 6: individual anonymized cards, with section 7's language
-- changes ("not a dating app") applied from the start — specifically: rough distance
-- bands instead of exact metres, and no visit-count language anywhere in this data. This
-- function is the data contract the eventual feed screen will consume; actual RN UI
-- (feed title copy, "Ask to connect" button text, avatar treatment) is a later step once
-- sign-up (step 9) and reveal (step 10-11) are also ready to wire in together.
create or replace function individual_cards_for_scope(p_scope_id uuid)
returns table (
  user_id uuid,
  line text,
  distance_band text,
  used_generic boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scopes;
  v_population uuid[];
begin
  select * into v_scope from scopes where id = p_scope_id;
  if not found then
    raise exception 'No scope %', p_scope_id;
  end if;

  -- Computed once (population_for_scope also enforces the caller-must-be-a-member check
  -- here), then reused both to filter candidates and as the k-anonymity reference
  -- population for every row — avoids recomputing the whole scope population per card.
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
      supp.used_generic
    from profile_attributes pa
    left join visibility_sessions vs
      on vs.user_id = pa.user_id and vs.is_active = true and vs.expires_at > now()
    cross join lateral suppression_for_user(pa.user_id, v_population, 5) as supp
    where pa.user_id = any(v_population)
      and pa.user_id <> auth.uid();
end;
$$;

grant execute on function individual_cards_for_scope(uuid) to authenticated;
