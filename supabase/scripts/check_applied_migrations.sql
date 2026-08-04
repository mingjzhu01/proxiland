-- Diagnostic only — not a migration, nothing to run "in order," just paste and run this
-- one file. Returns one row; each column tells you whether that migration has been applied.
select
  exists (select 1 from information_schema.tables where table_name = 'reveal_requests') as m0026_reveal_requests,
  exists (select 1 from information_schema.tables where table_name = 'card_bio_cache') as m0029_card_bio_cache,
  exists (select 1 from information_schema.tables where table_name = 'message_reads') as m0030_message_reads,
  exists (
    select 1 from pg_proc where proname = 'individual_cards_for_scope'
      and pg_get_function_result(oid) like '%role_category role_category%'
  ) as m0031_cards_return_role_category,
  exists (select 1 from information_schema.columns where table_name = 'profile_attributes' and column_name = 'hometown') as m0032_hometown_column,
  exists (select 1 from information_schema.columns where table_name = 'overlap_cache' and column_name = 'source_fingerprint') as m0032_fingerprint_column,
  exists (
    select 1 from pg_proc where proname = 'find_overlap'
      and pg_get_functiondef(oid) like '%hometown%'
  ) as m0033_find_overlap_hometown;
