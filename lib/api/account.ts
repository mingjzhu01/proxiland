import { supabase } from '../supabase';

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (!error) return;

  // supabase-js only puts a generic message on `error` for non-2xx responses — the actual
  // reason (e.g. "Demo account can't be deleted.") is in the raw response body, same
  // extraction pattern used elsewhere in this app for edge function errors.
  let specificMessage: string | null = null;
  const context = (error as any)?.context;
  if (context?.json) {
    try {
      const body = await context.json();
      specificMessage = typeof body?.error === 'string' ? body.error : null;
    } catch {
      // Response body wasn't JSON — fall back to the generic error below.
    }
  }

  throw new Error(specificMessage ?? error.message);
}
