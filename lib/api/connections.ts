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

export async function isConnectedTo(otherId: string): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
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
  return !!data;
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

export async function reportUser(targetId: string, reason: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('reports').insert({
    reporter_id: userData.user.id,
    target_id: targetId,
    reason,
  });

  if (error) throw error;
}
