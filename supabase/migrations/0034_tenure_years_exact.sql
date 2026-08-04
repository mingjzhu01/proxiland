-- Founder decision, with the tradeoff explicitly flagged and accepted: show the exact
-- number of years when the bio states one, rather than always rounding to the tenure_band
-- bucket. tenure_band itself is untouched and still drives the k-anonymity population count
-- (section 8's "how many people in this scope match" check still runs on the bucket) — this
-- column only affects how the fact is WORDED once that check has already decided it's safe
-- to show something. Deliberately not part of the suppression drop sequence itself.
alter table profile_attributes add column tenure_years_exact int;

-- assemble_line: add the new param with a default so existing callers (there are none left
-- without it after this migration's follow-up changes, but the default keeps this from
-- being a breaking signature change) keep working unchanged.
create or replace function assemble_line(
  p_role_category role_category,
  p_industry text,
  p_stage text,
  p_school text,
  p_prior_employer text,
  p_tenure_band text,
  p_keep_industry boolean,
  p_keep_stage boolean,
  p_keep_school boolean,
  p_keep_prior_employer boolean,
  p_keep_tenure_band boolean,
  p_used_generic boolean,
  p_tenure_years_exact int default null
)
returns text
language plpgsql
immutable
as $$
declare
  core text;
  parts text[] := '{}';
  result text;
begin
  if p_used_generic then
    return initcap(p_role_category::text);
  end if;

  core := trim(concat_ws(' ',
    case when p_keep_stage and p_stage is not null then lower(p_stage) end,
    case when p_keep_industry then lower(p_industry) end,
    lower(p_role_category::text)
  ));
  parts := array_append(parts, core);

  if p_keep_prior_employer and p_prior_employer is not null then
    parts := array_append(parts, 'ex ' || p_prior_employer);
  end if;

  if p_keep_school and p_school is not null then
    parts := array_append(parts, p_school || ' grad');
  end if;

  if p_keep_tenure_band then
    if p_tenure_years_exact is not null then
      parts := array_append(parts, p_tenure_years_exact || 'y experience');
    elsif p_tenure_band is not null then
      parts := array_append(parts, p_tenure_band || ' experience');
    end if;
  end if;

  result := array_to_string(parts, ', ');
  return upper(left(result, 1)) || substring(result from 2);
end;
$$;

-- Body-only change (same return shape as migration 0031) — pass the new field through.
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
    cross join lateral suppression_for_user(pa.user_id, v_population, 5) as supp
    left join overlap_cache oc
      on oc.user_a = least(v_caller, pa.user_id)
     and oc.user_b = greatest(v_caller, pa.user_id)
    where pa.user_id = any(v_population)
      and pa.user_id <> v_caller;
end;
$$;
