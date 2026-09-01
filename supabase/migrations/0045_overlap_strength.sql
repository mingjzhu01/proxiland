-- The Nearby feed now computes "why you two" for everyone currently in view (not just
-- on-demand via Expand), so it can show it upfront and sort strangers by how strong the
-- overlap is. Sorting needs something to sort by — phrase-overlap now also returns a 0-3
-- strength score, cached alongside the phrase. 0 rows (no genuine overlap) are cached too,
-- same as before via the 'NONE' phrase sentinel — this just adds the number.
alter table overlap_cache add column strength int not null default 0;
