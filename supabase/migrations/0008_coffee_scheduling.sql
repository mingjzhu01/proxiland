alter table connection_requests
  add column meeting_location text,
  add column meeting_at timestamptz;
