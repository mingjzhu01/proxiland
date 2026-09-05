-- v2 event mode, phase 7: outcome measurement. No admin UI exists anywhere in this app
-- (events themselves are created via scripts/create-event.mjs, not a UI) — consistent with
-- that, this is a single SQL-editor reporting tool, not an in-app dashboard nobody asked for.
--
-- Deliberately NOT gated to "only the event's organizer" — events are created by a
-- service-role script with no auth.uid() of its own, so there's no clean organizer identity
-- to check against (scopes.created_by, from the original geo-scope design, is null for every
-- event created this way). This only ever returns aggregate counts, never individual
-- attendee identities, so leaving it callable by any authenticated caller (or the SQL editor,
-- which runs as postgres and bypasses auth.uid() entirely) carries no real exposure.
--
-- Run it as: select event_report('<the event's scope id>');
create or replace function event_report(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope scopes;
  v_total_attendees int;
  v_attendees_with_intent int;
  v_total_recommendations int;
  v_users_with_recommendations int;
  v_requests_sent int;
  v_requests_accepted int;
  v_requests_declined int;
  v_requests_pending int;
  v_recommended_pairs_connected int;
  v_ai_runs int;
  v_fallback_runs int;
begin
  select * into v_scope from scopes where id = p_event_id and kind = 'venue';
  if not found then
    raise exception 'No such event';
  end if;

  select count(*) into v_total_attendees
  from scope_members where scope_id = p_event_id and status = 'active';

  select count(*) into v_attendees_with_intent
  from event_intents ei
  join scope_members sm on sm.scope_id = ei.scope_id and sm.user_id = ei.user_id and sm.status = 'active'
  where ei.scope_id = p_event_id and (ei.ask_text is not null or ei.offer_text is not null);

  select count(*), count(distinct source_user_id) into v_total_recommendations, v_users_with_recommendations
  from match_recommendations where scope_id = p_event_id;

  select
    count(*) filter (where true),
    count(*) filter (where status = 'accepted'),
    count(*) filter (where status = 'declined'),
    count(*) filter (where status = 'pending')
  into v_requests_sent, v_requests_accepted, v_requests_declined, v_requests_pending
  from connection_requests
  where context_type = 'event' and event_id = p_event_id and type = 'connect';

  -- The key "did this actually work" number: of everyone the AI/deterministic pipeline
  -- recommended, how many pairs are now an actual connection (via any path — an event
  -- connect request, or otherwise).
  select count(*) into v_recommended_pairs_connected
  from match_recommendations mr
  where mr.scope_id = p_event_id
    and exists (
      select 1 from connections c
      where c.user_a = least(mr.source_user_id, mr.candidate_user_id)
        and c.user_b = greatest(mr.source_user_id, mr.candidate_user_id)
    );

  select
    count(*) filter (where status = 'ai'),
    count(*) filter (where status = 'deterministic_fallback')
  into v_ai_runs, v_fallback_runs
  from match_runs where scope_id = p_event_id;

  return jsonb_build_object(
    'event_name', v_scope.name,
    'total_attendees', v_total_attendees,
    'attendees_with_intent_set', v_attendees_with_intent,
    'total_match_recommendations', v_total_recommendations,
    'attendees_who_generated_matches', v_users_with_recommendations,
    'connect_requests_sent_from_this_event', v_requests_sent,
    'connect_requests_accepted', v_requests_accepted,
    'connect_requests_declined', v_requests_declined,
    'connect_requests_pending', v_requests_pending,
    'recommended_pairs_that_became_connections', v_recommended_pairs_connected,
    'match_runs_using_ai', v_ai_runs,
    'match_runs_using_fallback', v_fallback_runs
  );
end;
$$;

revoke execute on function event_report(uuid) from public;
grant execute on function event_report(uuid) to authenticated;
