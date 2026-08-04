-- Adds hometown as a matchable overlap type (priority just after school — similarly
-- specific/concrete), now that migration 0032 gives profile_attributes a place to store it.
create or replace function find_overlap(p_user_a uuid, p_user_b uuid)
returns table (overlap_type text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  a profile_attributes%rowtype;
  b profile_attributes%rowtype;
begin
  select * into a from profile_attributes where user_id = p_user_a;
  select * into b from profile_attributes where user_id = p_user_b;

  if a.user_id is null or b.user_id is null then
    return;
  end if;

  if a.prior_employer is not null and b.prior_employer is not null
     and lower(a.prior_employer) = lower(b.prior_employer) then
    return query select 'employer'::text, a.prior_employer;
    return;
  end if;

  if a.school is not null and b.school is not null
     and lower(a.school) = lower(b.school) then
    return query select 'school'::text, a.school;
    return;
  end if;

  if a.hometown is not null and b.hometown is not null
     and lower(a.hometown) = lower(b.hometown) then
    return query select 'hometown'::text, a.hometown;
    return;
  end if;

  if words_overlap(a.looking_for, b.can_offer) or words_overlap(b.looking_for, a.can_offer) then
    return query select 'wants_offers'::text, 'wants and offers align'::text;
    return;
  end if;

  if a.industry = b.industry then
    return query select 'industry'::text, a.industry;
    return;
  end if;

  return;
end;
$$;
