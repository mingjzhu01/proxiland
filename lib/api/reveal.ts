import { supabase } from '../supabase';

export type Overlap = { overlap_type: string; phrase: string } | null;

export async function fetchOverlap(otherUserId: string): Promise<Overlap> {
  const { data, error } = await supabase.functions.invoke('phrase-overlap', {
    body: { other_user_id: otherUserId },
  });
  if (error) throw error;
  return data.overlap ?? null;
}

export async function createRevealRequest(targetId: string, connectionLine: string): Promise<void> {
  const { error } = await supabase.rpc('create_reveal_request', {
    p_target_id: targetId,
    p_connection_line: connectionLine,
  });
  if (error) throw error;
}

export async function getOutgoingPendingTargetIds(): Promise<Set<string>> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new Set();

  const { data, error } = await supabase
    .from('reveal_requests')
    .select('target_id')
    .eq('requester_id', userData.user.id)
    .eq('state', 'pending');

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.target_id as string));
}

export type IncomingRevealRequest = {
  id: string;
  connection_line: string;
  created_at: string;
  requester: {
    id: string;
    full_name: string;
    headline: string | null;
    photo_url: string | null;
  } | null;
};

export async function getIncomingRevealRequests(): Promise<IncomingRevealRequest[]> {
  const { data: requests, error } = await supabase
    .from('reveal_requests')
    .select('id, requester_id, connection_line, created_at')
    .eq('state', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  // reveal_requests.requester_id references auth.users, not profiles, so PostgREST can't
  // embed this as a join — fetch profiles separately. RLS (migration 0027) allows reading
  // each requester's profile precisely because each of these requests is still pending.
  const requesterIds = requests.map((r) => r.requester_id as string);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, headline, photo_url')
    .in('id', requesterIds);

  if (profilesError) throw profilesError;
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return requests.map((r) => ({
    id: r.id,
    connection_line: r.connection_line,
    created_at: r.created_at,
    requester: byId.get(r.requester_id as string) ?? null,
  }));
}

export async function revealRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('reveal_request', { p_request_id: requestId });
  if (error) throw error;
}
