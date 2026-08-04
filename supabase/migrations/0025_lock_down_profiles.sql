-- Spec v4 section 11.1: "anonymity lives in the database, never in the app." profiles has
-- been readable by any authenticated user since migration 0001 — a bare
-- `select * from profiles where id = '<any uuid>'` returns full name/photo/employer for
-- anyone, completely bypassing the entire v4 anonymized-card/reveal model. Closing that.
--
-- The base table now only opens to self and existing connections. v1's legitimate
-- "view a currently-nearby, currently-visible stranger's profile" feature (tapping a card
-- in app/profile/[id].tsx) is preserved via a security-definer function that re-applies the
-- exact same reciprocity gate nearby_users() already enforces (migration 0011: you must be
-- visible yourself to see someone else's full profile), rather than reopening the table.
drop policy "profiles are readable by any authenticated user" on profiles;

create policy "profiles readable by self or connection"
  on profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from connections c
      where (c.user_a = auth.uid() and c.user_b = profiles.id)
         or (c.user_b = auth.uid() and c.user_a = profiles.id)
    )
  );

-- Same radius default as nearby_users(). Uses each side's stored visibility_sessions
-- location rather than a live-passed coordinate — close enough given this is only ever
-- called moments after the caller saw the target in their nearby list.
create function get_nearby_profile(p_target_id uuid, p_radius_m integer default 5000)
returns table (
  id uuid,
  full_name text,
  headline text,
  employer text,
  title text,
  undergrad_school text,
  undergrad_year text,
  grad_degree_type text,
  grad_school text,
  grad_year text,
  photo_url text,
  bio text,
  linkedin_verified boolean,
  linkedin_url text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id, p.full_name, p.headline, p.employer, p.title,
    p.undergrad_school, p.undergrad_year, p.grad_degree_type, p.grad_school, p.grad_year,
    p.photo_url, p.bio, p.linkedin_verified, p.linkedin_url
  from profiles p
  join visibility_sessions vs_target
    on vs_target.user_id = p.id and vs_target.is_active = true and vs_target.expires_at > now()
  join visibility_sessions vs_me
    on vs_me.user_id = auth.uid() and vs_me.is_active = true and vs_me.expires_at > now()
  where p.id = p_target_id
    and st_dwithin(vs_target.location, vs_me.location, p_radius_m)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.target_id = p.id)
         or (b.blocker_id = p.id and b.target_id = auth.uid())
    );
$$;

grant execute on function get_nearby_profile(uuid, integer) to authenticated;
