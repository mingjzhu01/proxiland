// Organizer/admin event management — every function here maps to a security-definer RPC from
// migration 0060 that re-checks created_by/is_admin server-side regardless of what the client
// shows. Only reachable from app/organizer/* screens, themselves gated on useAuth().isAdmin.
import { supabase } from '../supabase';

export type OrganizedEvent = {
  id: string;
  name: string | null;
  organizer_name: string | null;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  status: 'draft' | 'active' | 'ended' | 'cancelled';
};

export type EventDraft = {
  name: string;
  organizerName: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
};

export async function getMyOrganizedEvents(): Promise<OrganizedEvent[]> {
  const { data, error } = await supabase.rpc('get_my_organized_events');
  if (error) throw error;
  return data ?? [];
}

export async function createEvent(draft: EventDraft): Promise<string> {
  const { data, error } = await supabase.rpc('create_event', {
    p_name: draft.name,
    p_organizer_name: draft.organizerName,
    p_description: draft.description,
    p_venue_name: draft.venueName,
    p_venue_address: draft.venueAddress,
    p_lat: draft.lat,
    p_lng: draft.lng,
    p_radius_m: draft.radiusM,
    p_starts_at: draft.startsAt,
    p_ends_at: draft.endsAt,
    p_timezone: draft.timezone,
  });
  if (error) throw error;
  return data as string;
}

export type EventForEdit = OrganizedEvent & { lat: number | null; lng: number | null; radius_m: number | null };

export async function getEventForEdit(eventId: string): Promise<EventForEdit | null> {
  const { data, error } = await supabase.rpc('get_event_for_edit', { p_event_id: eventId });
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function updateEvent(eventId: string, draft: EventDraft): Promise<void> {
  const { error } = await supabase.rpc('update_event', {
    p_event_id: eventId,
    p_name: draft.name,
    p_organizer_name: draft.organizerName,
    p_description: draft.description,
    p_venue_name: draft.venueName,
    p_venue_address: draft.venueAddress,
    p_lat: draft.lat,
    p_lng: draft.lng,
    p_radius_m: draft.radiusM,
    p_starts_at: draft.startsAt,
    p_ends_at: draft.endsAt,
    p_timezone: draft.timezone,
  });
  if (error) throw error;
}

// Returns the raw token/code exactly once — only their hashes persist. Call again any time to
// rotate (invalidates whatever link/code was shared before).
export async function rotateEventInvite(eventId: string): Promise<{ rawToken: string; rawShortCode: string }> {
  const { data, error } = await supabase.rpc('rotate_event_invite', { p_event_id: eventId });
  if (error) throw error;
  const row = data && data.length > 0 ? data[0] : null;
  if (!row) throw new Error('No invite returned');
  return { rawToken: row.raw_token, rawShortCode: row.raw_short_code };
}

export async function publishEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_event', { p_event_id: eventId });
  if (error) throw error;
}

export async function endEventEarly(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('end_event_early', { p_event_id: eventId });
  if (error) throw error;
}

export type EventManagementSummary = {
  joined_count: number;
  completed_intent_count: number;
  checked_in_count: number;
  status: string;
};

export async function getEventManagementSummary(eventId: string): Promise<EventManagementSummary> {
  const { data, error } = await supabase.rpc('get_event_management_summary', { p_event_id: eventId });
  if (error) throw error;
  return data as EventManagementSummary;
}

export type OrganizerParticipant = {
  user_id: string;
  full_name: string | null;
  joined_at: string;
  checked_in_at: string | null;
  intent_completed: boolean;
  status: 'active' | 'left';
};

export async function getEventParticipantsForOrganizer(eventId: string): Promise<OrganizerParticipant[]> {
  const { data, error } = await supabase.rpc('get_event_participants_for_organizer', { p_event_id: eventId });
  if (error) throw error;
  return data ?? [];
}

export async function removeEventParticipant(eventId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_event_participant', {
    p_event_id: eventId,
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
}
