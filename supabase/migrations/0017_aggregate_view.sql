-- Spec v4, section 14 step 5: the aggregate density view — "14 people nearby: 6 founders,
-- 3 investors" — ships before individual cards specifically because a sparse list looks
-- dead at low density (section 16, risk 5).

-- population_for_scope: dispatches by scope kind so callers (this function, and later the
-- individual-card feed in step 6) don't need to know geo vs venue. Enforces the
-- reciprocity principle from section 5 ("no browsing while invisible... never weaken it
-- for growth") at this single chokepoint: only members of a scope can query its
-- population — an arbitrary authenticated caller who guesses a scope_id gets nothing.
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
    select 1 from scope_members where scope_id = p_scope_id and user_id = auth.uid()
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Not authorized: you are not a member of this scope';
  end if;

  if v_kind = 'geo' then
    return query select * from geo_scope_population(p_scope_id);
  else
    return query select sm.user_id from scope_members sm where sm.scope_id = p_scope_id;
  end if;
end;
$$;

grant execute on function population_for_scope(uuid) to authenticated;

-- aggregate_view_for_scope: total count plus a breakdown by role_category, matching the
-- spec's own example format. Returns json as a single object rather than a denormalized
-- row-per-role table, since that's a more natural shape for the client to render directly.
create or replace function aggregate_view_for_scope(p_scope_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_by_role json;
begin
  select count(*) into v_total from population_for_scope(p_scope_id);

  select coalesce(
    json_agg(json_build_object('role_category', role_category, 'count', role_count) order by role_count desc),
    '[]'::json
  )
  into v_by_role
  from (
    select pa.role_category, count(*)::int as role_count
    from population_for_scope(p_scope_id) pop
    join profile_attributes pa on pa.user_id = pop.user_id
    group by pa.role_category
  ) sub;

  return json_build_object('total_count', v_total, 'by_role', v_by_role);
end;
$$;

grant execute on function aggregate_view_for_scope(uuid) to authenticated;
