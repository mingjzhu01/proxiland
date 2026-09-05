-- v2 event mode, phase 6: Nearby identity toggle. Per the pivot's confirmed decision, Nearby
-- flips to full-identity-by-default with anonymity as an opt-in.
--
-- Critical constraint: v1.0 is still "Waiting for Review" in the App Store queue, and it's
-- the same production database — the live build already calls individual_cards_for_scope()
-- (migration 0036) on every Nearby load. That function is left COMPLETELY untouched here.
-- This migration only adds a new column (inert until read) and a new function under a new
-- name — the currently-submitted app bundle has no code path that can reach either, so this
-- is safe to run immediately regardless of where the review stands. Only a future app build
-- that's written to call individual_cards_for_scope_v2 will ever see the new behavior.
alter table profile_attributes add column nearby_identity_visibility text not null default 'full'
  check (nearby_identity_visibility in ('anonymous', 'full'));

create function individual_cards_for_scope_v2(p_scope_id uuid)
returns table (
  user_id uuid,
  identity_visibility text,
  line text,
  role_category role_category,
  distance_band text,
  used_generic boolean,
  overlap_phrase text,
  full_name text,
  headline text,
  employer text,
  title text,
  undergrad_school text,
  undergrad_year text,
  grad_school text,
  grad_year text,
  photo_url text
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
      pa.nearby_identity_visibility,
      case when pa.nearby_identity_visibility = 'anonymous' then
        assemble_line(
          pa.role_category, pa.industry, pa.stage, pa.school, pa.prior_employer_industry, pa.tenure_band,
          supp.keep_industry, supp.keep_stage, supp.keep_school, supp.keep_prior_employer,
          supp.keep_tenure_band, supp.used_generic, pa.tenure_years_exact
        )
      else null end,
      pa.role_category,
      case
        when v_scope.kind = 'venue' then null
        when vs.location is null then null
        when st_distance(vs.location, v_scope.center) < 100 then 'in this building'
        when st_distance(vs.location, v_scope.center) < 1000 then 'nearby'
        else 'in the area'
      end,
      case when pa.nearby_identity_visibility = 'anonymous' then supp.used_generic else null end,
      oc.phrase,
      case when pa.nearby_identity_visibility = 'full' then p.full_name else null end,
      case when pa.nearby_identity_visibility = 'full' then p.headline else null end,
      case when pa.nearby_identity_visibility = 'full' then p.employer else null end,
      case when pa.nearby_identity_visibility = 'full' then p.title else null end,
      case when pa.nearby_identity_visibility = 'full' then p.undergrad_school else null end,
      case when pa.nearby_identity_visibility = 'full' then p.undergrad_year else null end,
      case when pa.nearby_identity_visibility = 'full' then p.grad_school else null end,
      case when pa.nearby_identity_visibility = 'full' then p.grad_year else null end,
      case when pa.nearby_identity_visibility = 'full' then p.photo_url else null end
    from profile_attributes pa
    join profiles p on p.id = pa.user_id
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

revoke execute on function individual_cards_for_scope_v2(uuid) from public;
grant execute on function individual_cards_for_scope_v2(uuid) to authenticated;
