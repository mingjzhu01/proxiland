-- Founder request: add "Strategist" as a role option, and expand the industry list with
-- more categories for the new scrollable picker (replacing the old 7-chip grid).
--
-- ALTER TYPE ... ADD VALUE must be its own statement, not combined with anything that
-- references the new value in the same transaction — this migration only adds the value,
-- nothing else in this file uses it.
alter type role_category add value 'strategist';

-- Industry's check constraint is dropped and recreated with the expanded list. Finding it
-- by querying pg_constraint rather than assuming Postgres's default auto-generated name, in
-- case it was ever named explicitly.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'profile_attributes'::regclass
    and pg_get_constraintdef(oid) like '%industry%';

  if v_constraint_name is not null then
    execute format('alter table profile_attributes drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table profile_attributes add constraint profile_attributes_industry_check
  check (industry in (
    'fintech', 'foodtech', 'climate', 'healthtech', 'logistics', 'consumer', 'enterprise',
    'edtech', 'proptech', 'insurtech', 'biotech', 'hardware', 'media', 'gaming',
    'cybersecurity', 'ai infrastructure', 'mobility', 'energy', 'agriculture', 'real estate',
    'travel', 'legal tech', 'hr tech', 'marketing tech', 'web3', 'space', 'manufacturing',
    'retail', 'social impact'
  ));
