// Lightweight post-event feedback (migration 0060's event_feedback table). Direct table
// access, not a security-definer function — RLS already scopes this to "manage your own row"
// (same pattern as event_intents), and there's no cross-user logic to protect here.
import { supabase } from '../supabase';

export async function submitEventFeedback(
  eventId: string,
  foundUseful: boolean | null,
  comment: string | null
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { error } = await supabase.from('event_feedback').upsert(
    {
      scope_id: eventId,
      user_id: userData.user.id,
      found_useful: foundUseful,
      comment: comment?.trim() || null,
    },
    { onConflict: 'scope_id,user_id' }
  );
  if (error) throw error;
}

export async function hasSubmittedEventFeedback(eventId: string): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;

  const { data, error } = await supabase
    .from('event_feedback')
    .select('scope_id')
    .eq('scope_id', eventId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}
