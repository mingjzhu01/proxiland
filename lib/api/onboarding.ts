import { supabase } from '../supabase';
import type { RoleCategory, SeniorityBand, Industry } from '../allowedValues';

export type QuickFields = {
  role_category?: RoleCategory;
  industry?: Industry;
  seniority_band?: SeniorityBand;
  school?: string;
  looking_for?: string;
  can_offer?: string;
};

export type ProfileAttributes = {
  user_id: string;
  role_category: RoleCategory;
  seniority_band: SeniorityBand;
  industry: Industry;
  stage: string | null;
  school: string | null;
  prior_employer: string | null;
  tenure_band: string | null;
  looking_for: string | null;
  can_offer: string | null;
  line_assembled: string | null;
  line_polished: string | null;
  user_edited: boolean;
};

export async function parseProfile(args: {
  rawText?: string;
  quickFields?: QuickFields;
}): Promise<ProfileAttributes> {
  const { data, error } = await supabase.functions.invoke('parse-profile', {
    body: { rawText: args.rawText ?? '', quickFields: args.quickFields ?? {} },
  });
  if (error) throw error;
  return data.profile as ProfileAttributes;
}

export async function polishLine(): Promise<{ line_assembled: string; line_polished: string | null }> {
  const { data, error } = await supabase.functions.invoke('polish-line', { body: {} });
  if (error) throw error;
  return data;
}

export async function getMyProfileAttributes(): Promise<ProfileAttributes | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('profile_attributes')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Updates the structured quick fields directly, without going through parse-profile.
// Used when user_edited is already true, where calling parse-profile would be a no-op
// (it refuses to touch anything on a row with user_edited=true) — this still needs to
// apply the field changes, just without regenerating the line.
export async function updateQuickFields(fields: {
  role_category: RoleCategory;
  industry: Industry;
  seniority_band: SeniorityBand;
  school: string | null;
  looking_for: string | null;
  can_offer: string | null;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('profile_attributes')
    .update(fields)
    .eq('user_id', userData.user.id);

  if (error) throw error;
}

export async function saveEditedLine(line: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('profile_attributes')
    .update({ line_polished: line.trim(), user_edited: true })
    .eq('user_id', userData.user.id);

  if (error) throw error;
}
