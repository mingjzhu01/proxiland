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

// v2: full-identity-by-default Nearby, anonymity as an opt-in (migration 0056). Calls a new
// function that the currently-submitted App Store build has no way to reach — see that
// migration's comment for why this was built as a new function rather than changing
// individual_cards_for_scope in place.
export type FeedCardV2 = {
  user_id: string;
  identity_visibility: 'anonymous' | 'full';
  line: string | null;
  role_category: RoleCategory;
  distance_band: 'in this building' | 'nearby' | 'in the area' | null;
  used_generic: boolean | null;
  overlap_phrase: string | null;
  full_name: string | null;
  headline: string | null;
  employer: string | null;
  title: string | null;
  undergrad_school: string | null;
  undergrad_year: string | null;
  grad_school: string | null;
  grad_year: string | null;
  photo_url: string | null;
};

export async function getFeedCardsV2(scopeId: string): Promise<FeedCardV2[]> {
  const { data, error } = await supabase.rpc('individual_cards_for_scope_v2', { p_scope_id: scopeId });
  if (error) throw error;
  return data ?? [];
}

export async function getMyNearbyIdentityVisibility(): Promise<'anonymous' | 'full'> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return 'full';

  const { data, error } = await supabase
    .from('profile_attributes')
    .select('nearby_identity_visibility')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  return (data?.nearby_identity_visibility as 'anonymous' | 'full') ?? 'full';
}

export async function setMyNearbyIdentityVisibility(visibility: 'anonymous' | 'full'): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('profile_attributes')
    .update({ nearby_identity_visibility: visibility })
    .eq('user_id', userData.user.id);

  if (error) throw error;
}

export async function expandBio(targetUserId: string, scopeId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('expand-bio', {
    body: { target_user_id: targetUserId, scope_id: scopeId },
  });
  if (error) throw error;
  return data.bio;
}
