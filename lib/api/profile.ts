import { supabase } from '../supabase';
import type { Profile } from '../types';

export async function getMyProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  // Not self and not connected — direct table read returns nothing under RLS (migration
  // 0025). Fall back to the reciprocity-gated RPC: still visible if we're both currently
  // opted into nearby visibility and in range, matching nearby_users()' own gate.
  const { data: nearbyData, error: nearbyError } = await supabase
    .rpc('get_nearby_profile', { p_target_id: userId })
    .maybeSingle();

  if (nearbyError) throw nearbyError;
  return (nearbyData as Profile) ?? null;
}

export async function upsertMyProfile(
  fields: Partial<Omit<Profile, 'id' | 'created_at'>>
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const trimmed = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ])
  );

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userData.user.id, ...trimmed });

  if (error) throw error;
}

export async function uploadProfilePhoto(userId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const fileExt = uri.split('.').pop() ?? 'jpg';
  const path = `${userId}/profile.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, {
      contentType: `image/${fileExt}`,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
