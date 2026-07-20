-- Auto-create a profile row whenever a new auth user is created, using the
-- full_name passed in signUp's options.data. This avoids depending on an
-- active session immediately after signUp (which doesn't exist yet if email
-- confirmation is required).
create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();
