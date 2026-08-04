import { supabase } from '../supabase';

export const INTENT_STATES = [
  'job_hunting', 'raising_money', 'new_to_city', 'at_event', 'just_curious',
] as const;

export type IntentState = (typeof INTENT_STATES)[number];

export const INTENT_STATE_LABELS: Record<IntentState, string> = {
  job_hunting: 'Job hunting or exploring',
  raising_money: 'Raising money',
  new_to_city: 'New to this city or role',
  at_event: 'At an event or travelling',
  just_curious: 'None of these, just curious',
};

export async function logSessionEvent(
  eventType: 'session_open' | 'card_expand' | 'connect_request' | 'connect_accept',
  options?: { scopeId?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  // Best-effort — instrumentation should never block or surface errors to the user.
  try {
    await supabase.rpc('log_session_event', {
      p_event_type: eventType,
      p_scope_id: options?.scopeId ?? null,
      p_metadata: options?.metadata ?? null,
    });
  } catch {
    // ignore
  }
}

export async function setIntentState(state: IntentState): Promise<void> {
  const { error } = await supabase.rpc('set_intent_state', { p_intent_state: state });
  if (error) throw error;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function shouldPromptIntentState(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('intent_state_updated_at')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error || !data) return false;
  if (!data.intent_state_updated_at) return true;

  return Date.now() - new Date(data.intent_state_updated_at).getTime() > FOURTEEN_DAYS_MS;
}
