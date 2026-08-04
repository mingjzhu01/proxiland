alter table profiles
  add column linkedin_verified boolean not null default false,
  add column linkedin_sub text unique,
  add column linkedin_url text;
