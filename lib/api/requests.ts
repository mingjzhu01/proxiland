import { supabase } from '../supabase';
import type { ConnectionRequest, RequestType } from '../types';

export async function sendRequest(
  receiverId: string,
  type: RequestType,
  options?: { message?: string; meetingLocation?: string; meetingAt?: Date }
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('connection_requests').insert({
    sender_id: userData.user.id,
    receiver_id: receiverId,
    type,
    message: options?.message ?? null,
    meeting_location: options?.meetingLocation ?? null,
    meeting_at: options?.meetingAt?.toISOString() ?? null,
    status: 'pending',
  });

  if (error) throw error;
}

export async function respondToRequest(
  requestId: string,
  status: 'accepted' | 'declined'
): Promise<void> {
  const { data, error } = await supabase
    .from('connection_requests')
    .update({ status })
    .eq('id', requestId)
    .select('type, meeting_at')
    .single();

  if (error) throw error;

  if (status === 'accepted' && data.type === 'coffee' && data.meeting_at) {
    // Best-effort: failure to send the calendar invite shouldn't fail the accept action.
    supabase.functions.invoke('send-coffee-invite', { body: { requestId } }).catch(() => {});
  }
}

export async function getIncomingRequests(): Promise<ConnectionRequest[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('connection_requests')
    .select('*, sender:profiles!connection_requests_sender_id_fkey(*)')
    .eq('receiver_id', userData.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getScheduledCoffees(): Promise<ConnectionRequest[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const myId = userData.user.id;

  const { data, error } = await supabase
    .from('connection_requests')
    .select(
      '*, sender:profiles!connection_requests_sender_id_fkey(*), receiver:profiles!connection_requests_receiver_id_fkey(*)'
    )
    .eq('type', 'coffee')
    .eq('status', 'accepted')
    .not('meeting_at', 'is', null)
    .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
    .order('meeting_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getOutgoingRequests(): Promise<ConnectionRequest[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('connection_requests')
    .select('*, receiver:profiles!connection_requests_receiver_id_fkey(*)')
    .eq('sender_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
