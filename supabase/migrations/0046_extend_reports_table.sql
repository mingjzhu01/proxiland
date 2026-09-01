-- Extends the existing `reports` table (from migration 0001) rather than creating a
-- parallel user_reports table — it already has reporter_id/target_id/reason/RLS, just needed
-- a structured reason, an optional details field, and context (profile vs chat). The existing
-- reportUser() call site (app/profile/[id].tsx) passed a hardcoded freeform string as reason;
-- normalize any of those before adding the check constraint so it doesn't fail on real rows.
update reports set reason = 'other'
where reason not in ('impersonation', 'harassment', 'inappropriate_content', 'spam', 'other');

alter table reports add constraint reports_reason_check
  check (reason in ('impersonation', 'harassment', 'inappropriate_content', 'spam', 'other'));

alter table reports add column context text not null default 'profile'
  check (context in ('profile', 'chat'));

alter table reports add column details text;
