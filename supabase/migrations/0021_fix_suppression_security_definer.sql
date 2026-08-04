-- Fixes a bug caught on code review (not empirically reproduced live — there's currently
-- only one real row in profile_attributes, so a direct RPC test couldn't actually tell the
-- difference either way). suppression_for_user reads OTHER users' profile_attributes rows
-- to count population matches, but profile_attributes' RLS policy is owner-only. Without
-- security definer, a direct RPC call from a regular authenticated user would silently
-- undercount (only able to see rows RLS lets them see), producing incorrect — too
-- aggressive — suppression decisions. individual_cards_for_scope's own tests passed
-- because it calls this function from within its own already-elevated security definer
-- context, which masked the gap for that one call path; a direct external call would not
-- have been so lucky. Fixed for consistency with every other cross-user-reading function
-- in this codebase.
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
security definer
set search_path = public
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
      return query select false, false, false, false, false, true, v_cnt;
      return;
    end if;
  end loop;
end;
$$;
