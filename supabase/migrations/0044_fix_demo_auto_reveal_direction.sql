-- Bugfix for migration 0043: the auto-reveal cron matched any pending reveal_request between
-- two demo accounts regardless of direction, which also auto-resolved the two NPC-initiated
-- pre-seeded requests that were deliberately meant to stay pending until the reviewer manually
-- reveals back (testing that interaction path). Tightened to only auto-complete requests the
-- demo ACCOUNT itself sent to an NPC — never the reverse.
select cron.schedule(
  'demo-mode-auto-reveal',
  '* * * * *',
  $cron$
    with newly_revealed as (
      update reveal_requests rr
      set state = 'revealed', resolved_at = now()
      from profiles pr
      join auth.users u on u.id = pr.id
      where pr.id = rr.requester_id
        and u.email = 'appreview@proxiland.app'
        and rr.state = 'pending'
        and rr.expires_at > now()
        and rr.created_at <= now() - interval '10 seconds'
        and exists (select 1 from profiles pt where pt.id = rr.target_id and pt.is_demo)
      returning requester_id, target_id
    )
    insert into connections (user_a, user_b)
    select least(requester_id, target_id), greatest(requester_id, target_id) from newly_revealed
    on conflict do nothing;
  $cron$
);
