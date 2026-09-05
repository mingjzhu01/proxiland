-- v2 event mode, phase 1: population_for_scope (0018) predates scope_members.status —
-- it treated every scope_members row as an active member, which was harmless while venue
-- scopes were unused (geo scopes never write status='left') but is wrong now that leave_event
-- exists. Without this fix, a user who leaves an event would still be authorized to read the
-- population and would still appear in it.
create or replace function population_for_scope(p_scope_id uuid)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind scope_kind;
  v_is_member boolean;
begin
  select kind into v_kind from scopes where id = p_scope_id;
  if not found then
    raise exception 'No scope %', p_scope_id;
  end if;

  select exists(
    select 1 from scope_members sm2
    where sm2.scope_id = p_scope_id and sm2.user_id = auth.uid() and sm2.status = 'active'
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Not authorized: you are not a member of this scope';
  end if;

  if v_kind = 'geo' then
    return query select * from geo_scope_population(p_scope_id);
  else
    return query
      select sm.user_id from scope_members sm
      where sm.scope_id = p_scope_id and sm.status = 'active';
  end if;
end;
$$;
