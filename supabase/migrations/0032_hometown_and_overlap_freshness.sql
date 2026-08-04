-- Two fixes reported from live testing:
-- 1. Shared hometown (mentioned only in free-text bios, e.g. "home is Shenzhen") wasn't
--    extracted as structured data at all, so it could never surface as a "why you two"
--    match. Adding it as a plain free-text field, same treatment as school/prior_employer —
--    parse-profile's Job 1 model call now extracts it from rawText.
-- 2. overlap_cache had no way to notice when either person's underlying facts changed, so
--    a stale sentence (e.g. from back when both test accounts happened to share the same
--    placeholder school) stuck around forever instead of just until the facts changed.
--    Adding a fingerprint column, same pattern as profile_attributes.source_hash and
--    card_bio_cache.source_fingerprint — phrase-overlap recomputes only when the fingerprint
--    of the two people's relevant fields actually changes, not on every view (preserving the
--    "never regenerate the same sentence twice" cost control this table exists for).

alter table profile_attributes add column hometown text;

alter table overlap_cache add column source_fingerprint text;
