import { supabase } from '../supabase';
import { getCurrentCoords, requestForegroundLocationPermission } from '../location';
import type { RoleCategory } from '../allowedValues';

const DEFAULT_SCOPE_RADIUS_METERS = 100_000;

export type AggregateView = {
  total_count: number;
  by_role: { role_category: RoleCategory; count: number }[];
};

export type FeedCard = {
  user_id: string;
  line: string;
  role_category: RoleCategory;
  distance_band: 'in this building' | 'nearby' | 'in the area' | null;
  used_generic: boolean;
  overlap_phrase: string | null;
};

export async function getOrCreateGeoScope(radiusMeters = DEFAULT_SCOPE_RADIUS_METERS): Promise<string> {
  const granted = await requestForegroundLocationPermission();
  if (!granted) throw new Error('Location permission denied');

  const { lat, lng } = await getCurrentCoords();

  const { data, error } = await supabase.rpc('get_or_create_geo_scope', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusMeters,
  });

  if (error) throw error;
  return data as string;
}

export async function getAggregateView(scopeId: string): Promise<AggregateView> {
  const { data, error } = await supabase.rpc('aggregate_view_for_scope', { p_scope_id: scopeId });
  if (error) throw error;
  return data as AggregateView;
}

export async function getFeedCards(scopeId: string): Promise<FeedCard[]> {
  const { data, error } = await supabase.rpc('individual_cards_for_scope', { p_scope_id: scopeId });
  if (error) throw error;
  return data ?? [];
}

export async function expandBio(targetUserId: string, scopeId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('expand-bio', {
    body: { target_user_id: targetUserId, scope_id: scopeId },
  });
  if (error) throw error;
  return data.bio;
}
