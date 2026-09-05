import { supabase } from '../supabase';
import { sendRequest, getOutgoingRequests } from './requests';

export type EventSummary = {
  id: string;
  name: string | null;
  organizer_name: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export async function detectNearbyEvents(lat: number, lng: number): Promise<EventSummary[]> {
  const { data, error } = await supabase.rpc('detect_nearby_events', { p_lat: lat, p_lng: lng });
  if (error) throw error;
  return data ?? [];
}

export async function getEventByQrToken(token: string): Promise<EventSummary | null> {
  const { data, error } = await supabase.rpc('get_event_by_qr_token', { p_token: token });
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export type JoinMethod = 'geofence_prompt' | 'qr' | 'admin_test';

export async function joinEvent(eventId: string, joinMethod: JoinMethod): Promise<void> {
  const { error } = await supabase.rpc('join_event', { p_event_id: eventId, p_join_method: joinMethod });
  if (error) throw error;
}

export async function leaveEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_event', { p_event_id: eventId });
  if (error) throw error;
}

export async function getMyActiveEvents(): Promise<(EventSummary & { status: string })[]> {
  const { data, error } = await supabase.rpc('get_my_active_events');
  if (error) throw error;
  return data ?? [];
}

export type EventAttendee = {
  user_id: string;
  full_name: string;
  headline: string | null;
  employer: string | null;
  title: string | null;
  undergrad_school: string | null;
  undergrad_year: string | null;
  grad_school: string | null;
  grad_year: string | null;
  photo_url: string | null;
  role_category: string | null;
};

export async function getEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const { data, error } = await supabase.rpc('get_event_attendees', { p_event_id: eventId });
  if (error) throw error;
  return data ?? [];
}

export async function getMyEventMembership(
  eventId: string
): Promise<{ status: 'active' | 'left'; join_method: JoinMethod | null } | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('scope_members')
    .select('status, join_method')
    .eq('scope_id', eventId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export type EventIntent = {
  askOptionIds: string[];
  askDetailText: string | null;
  offerOptionIds: string[];
  offerDetailText: string | null;
  completedAt: string | null;
};

const EMPTY_INTENT: EventIntent = {
  askOptionIds: [],
  askDetailText: null,
  offerOptionIds: [],
  offerDetailText: null,
  completedAt: null,
};

export function isIntentComplete(intent: EventIntent | null): boolean {
  return !!intent?.completedAt;
}

export async function getMyEventIntent(eventId: string): Promise<EventIntent> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return EMPTY_INTENT;

  const { data, error } = await supabase
    .from('event_intents')
    .select('ask_tags, ask_text, offer_tags, offer_text, completed_at')
    .eq('scope_id', eventId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return EMPTY_INTENT;

  return {
    askOptionIds: data.ask_tags ?? [],
    askDetailText: data.ask_text,
    offerOptionIds: data.offer_tags ?? [],
    offerDetailText: data.offer_text,
    completedAt: data.completed_at,
  };
}

// Throws with the server's own validation message (1-3 selections, "Other" needs text, etc.)
// on failure — the picker UI already enforces the same rules client-side, this is the
// authoritative backstop, per EVENT_INTENT_DEFAULTS's "server-side validation is
// authoritative" (lib/eventIntentConfig.ts).
export async function upsertEventIntent(
  eventId: string,
  intent: { askOptionIds: string[]; askDetailText: string | null; offerOptionIds: string[]; offerDetailText: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('upsert_event_intent', {
    p_event_id: eventId,
    p_ask_option_ids: intent.askOptionIds,
    p_ask_detail_text: intent.askDetailText,
    p_offer_option_ids: intent.offerOptionIds,
    p_offer_detail_text: intent.offerDetailText,
  });
  if (error) throw error;
}

// Triggers (re)generation of this user's ranked recommendations for the event. Best called
// on first visiting the matches screen and on manual pull-to-refresh — not on every render —
// since it makes a real AI call server-side.
export async function generateEventMatches(eventId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('generate-event-matches', {
    body: { scope_id: eventId },
  });
  if (error) throw error;
}

export type EventMatch = {
  candidate_user_id: string;
  score: number;
  match_reason: string | null;
  intent_complement: number;
  professional_overlap: number;
};

// Reuses the existing connection_requests system (lib/api/requests.ts) rather than
// reveal_requests — event attendees are already fully identified, so there's no asymmetric
// disclosure step to model, just a normal accept/decline request handled by the existing
// Requests tab.
export async function sendEventConnectRequest(eventId: string, targetUserId: string): Promise<void> {
  await sendRequest(targetUserId, 'connect', { contextType: 'event', eventId });
}

export async function getOutgoingEventConnectTargetIds(eventId: string): Promise<Set<string>> {
  const outgoing = await getOutgoingRequests();
  return new Set(
    outgoing
      .filter((r) => r.type === 'connect' && r.event_id === eventId)
      .map((r) => r.receiver_id)
  );
}

export async function getMyEventMatches(eventId: string): Promise<EventMatch[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('match_recommendations')
    .select('candidate_user_id, score, match_reason, intent_complement, professional_overlap')
    .eq('scope_id', eventId)
    .eq('source_user_id', userData.user.id)
    .order('score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
