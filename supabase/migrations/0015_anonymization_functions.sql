-- Spec v4, section 14 step 2: the identification-check (k-anonymity) function and
-- assemble-line. Both pure Postgres functions, no model calls — testable independently.
-- See supabase/tests/section8_suppression_test.sql for the fact-dropping sequence tests.

-- suppression_for_user: given a candidate user and a population to compare against,
-- determines which optional fields can be shown without the candidate's attribute
-- combination dropping below k_min shared occurrences. Follows the exact drop order from
-- section 8: 1. prior_employer, 2. school, 3. stage, 4. tenure_band, 5. industry.
-- role_category and seniority_band are the base identity and are never dropped — if the
-- population sharing just those two is still below k_min, used_generic is set true.
create or replace function suppression_for_user(
  p_user_id uuid,
  p_population uuid[],
  p_k_min int default 5
)
returns table (
  keep_industry boolean,
  keep_stage boolean,
  keep_school boolean,
  keep_prior_employer boolean,
  keep_tenure_band boolean,
  used_generic boolean,
  match_count int
)
language plpgsql
as $$
declare
  cand record;
  v_keep_industry boolean;
  v_keep_stage boolean;
  v_keep_school boolean;
  v_keep_prior_employer boolean;
  v_keep_tenure_band boolean;
  v_cnt int;
  v_drop_step int := 0;
begin
  select * into cand from profile_attributes where user_id = p_user_id;
  if not found then
    raise exception 'No profile_attributes row for user %', p_user_id;
  end if;

  v_keep_industry := true;
  v_keep_stage := cand.stage is not null;
  v_keep_school := cand.school is not null;
  v_keep_prior_employer := cand.prior_employer is not null;
  v_keep_tenure_band := cand.tenure_band is not null;

  loop
    select count(*) into v_cnt
    from profile_attributes pa
    where pa.user_id = any(p_population)
      and pa.role_category = cand.role_category
      and pa.seniority_band = cand.seniority_band
      and (not v_keep_industry or pa.industry = cand.industry)
      and (not v_keep_stage or pa.stage = cand.stage)
      and (not v_keep_school or pa.school = cand.school)
      and (not v_keep_prior_employer or pa.prior_employer = cand.prior_employer)
      and (not v_keep_tenure_band or pa.tenure_band = cand.tenure_band);

    if v_cnt >= p_k_min then
      return query select v_keep_industry, v_keep_stage, v_keep_school,
        v_keep_prior_employer, v_keep_tenure_band, false, v_cnt;
      return;
    end if;

    v_drop_step := v_drop_step + 1;

    if v_drop_step = 1 then
      v_keep_prior_employer := false;
    elsif v_drop_step = 2 then
      v_keep_school := false;
    elsif v_drop_step = 3 then
      v_keep_stage := false;
    elsif v_drop_step = 4 then
      v_keep_tenure_band := false;
    elsif v_drop_step = 5 then
      v_keep_industry := false;
    else
      -- Everything droppable is dropped and even the base role+seniority bucket is
      -- below k_min. Generic fallback per section 8: "record that it happened" — the
      -- caller (the future feed-serving function) is responsible for logging this rate.
      return query select false, false, false, false, false, true, v_cnt;
      return;
    end if;
  end loop;
end;
$$;

-- assemble_line: no counting logic, pure template rendering from fields plus the
-- suppression flags produced by suppression_for_user. Deliberately does not render
-- seniority_band as a word — it's used for population matching, not spelled out in the
-- line itself, to keep it to roughly six to ten words per section 5.
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
  p_used_generic boolean
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

  if p_keep_tenure_band and p_tenure_band is not null then
    parts := array_append(parts, p_tenure_band || ' experience');
  end if;

  result := array_to_string(parts, ', ');
  return upper(left(result, 1)) || substring(result from 2);
end;
$$;
