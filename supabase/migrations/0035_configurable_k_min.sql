-- Spec v4 section 8: "K_MIN — the threshold... Stored as a configuration value, changeable
-- without touching code." It was a hardcoded literal `5` inside individual_cards_for_scope
-- instead — fixing that now. Single-row config table rather than a generic key/value store,
-- since K_MIN is the only setting like this so far.
create table app_config (
  id boolean primary key default true,
  k_min int not null default 5,
  constraint app_config_singleton check (id = true)
);

insert into app_config (k_min) values (5);

alter table app_config enable row level security;

create policy "anyone authenticated can read config"
  on app_config for select
  to authenticated
  using (true);

-- No write policy — changed only via the SQL editor (or a future admin tool), same
-- "founder controls the dial" spirit as K_MIN being a setting in the first place.

create function get_k_min()
returns int
language sql
stable
as $$
  select k_min from app_config limit 1;
$$;

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
        pa.role_category, pa.industry, pa.stage, pa.school, pa.prior_employer, pa.tenure_band,
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
