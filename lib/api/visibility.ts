import { supabase } from '../supabase';
import { getCurrentCoords, requestForegroundLocationPermission } from '../location';
import type { NearbyUser } from '../types';

const DEFAULT_RADIUS_METERS = 100_000;

export async function goVisible(durationHours: number): Promise<void> {
  const granted = await requestForegroundLocationPermission();
  if (!granted) throw new Error('Location permission denied');

  const { lat, lng } = await getCurrentCoords();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('visibility_sessions').insert({
    user_id: userData.user.id,
    location: `POINT(${lng} ${lat})`,
    expires_at: expiresAt,
    is_active: true,
  });

  if (error) throw error;
}

export async function goInvisible(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('visibility_sessions')
    .update({ is_active: false })
    .eq('user_id', userData.user.id)
    .eq('is_active', true);

  if (error) throw error;
}

export async function getMyActiveVisibility(): Promise<{ expiresAt: string } | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('visibility_sessions')
    .select('expires_at')
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? { expiresAt: data.expires_at } : null;
}

export async function getNearbyUsers(radiusMeters = DEFAULT_RADIUS_METERS): Promise<NearbyUser[]> {
  const { lat, lng } = await getCurrentCoords();

  const { data, error } = await supabase.rpc('nearby_users', {
    lat,
    lng,
    radius_m: radiusMeters,
  });

  if (error) throw error;
  return data ?? [];
}
