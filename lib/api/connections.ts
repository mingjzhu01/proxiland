import { supabase } from '../supabase';
import type { Connection, Profile } from '../types';

export async function getMyConnections(): Promise<Connection[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const myId = userData.user.id;

  const { data, error } = await supabase
    .from('connections')
    .select('*, profile_a:profiles!connections_user_a_fkey(*), profile_b:profiles!connections_user_b_fkey(*)')
    .or(`user_a.eq.${myId},user_b.eq.${myId}`)
    .order('connected_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    user_a: row.user_a,
    user_b: row.user_b,
    connected_at: row.connected_at,
    other: row.user_a === myId ? row.profile_b : row.profile_a,
  }));
}

export async function getConnectionWith(otherId: string): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const myId = userData.user.id;

  const userA = myId < otherId ? myId : otherId;
  const userB = myId < otherId ? otherId : myId;

  const { data, error } = await supabase
    .from('connections')
    .select('id')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export async function blockUser(targetId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('blocks').insert({
    blocker_id: userData.user.id,
    target_id: targetId,
  });

  if (error) throw error;
}

export async function getBlockedUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('target:profiles!blocks_target_id_fkey(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => row.target).filter(Boolean);
}

export async function unblockUser(targetId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', userData.user.id)
    .eq('target_id', targetId);

  if (error) throw error;
}

export type ReportReason = 'impersonation' | 'harassment' | 'inappropriate_content' | 'spam' | 'other';
export type ReportContext = 'profile' | 'chat';

// targetId is the reported person's real user_id even when the reporter only ever saw an
// anonymous card — the caller (AnonCard) has that id internally regardless of what's shown.
export async function reportUser(
  targetId: string,
  context: ReportContext,
  reason: ReportReason,
  details?: string
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: userData.user.id,
      target_id: targetId,
      context,
      reason,
      details: details?.trim() || null,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Best-effort — the report itself is already saved regardless of whether the notification
  // email goes out.
  supabase.functions.invoke('notify-report', { body: { reportId: data.id } }).catch(() => {});
}
