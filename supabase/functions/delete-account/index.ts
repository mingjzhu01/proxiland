// App Store guideline 5.1.1(v): in-app, no-external-steps account deletion.
//
// user_id is derived ONLY from the caller's JWT (never from the request body) so nobody can
// delete someone else's account. Storage is deleted first (not covered by Postgres FK
// cascades, and safe/idempotent to retry), then the auth user is deleted LAST via
// admin.deleteUser — at that point Postgres's own foreign-key cascades take over and wipe
// every other table keyed to this user in one transactional DELETE (profiles,
// profile_attributes, connection_requests, connections + their messages, reveal_requests,
// blocks, reports, overlap_cache, card_bio_cache, session_events, message_reads,
// ai_bio_requests, device_push_tokens, scope_members — every one of these already has
// `on delete cascade` back to auth.users, confirmed by reading every migration). Deleting the
// auth user last, after Storage, means a failure here is always safely retryable: nothing
// destructive has an irreversible partial state.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// This whole function's design rests on every user-data table already cascading from
// auth.users — true today (confirmed by reading every migration), but nothing stops a future
// table from being added without that cascade. Rather than trust that invariant silently
// forever, check it every time: after deleteUser, confirm nothing keyed to this user_id
// survived anywhere that matters, and log loudly (visible in the function's logs) if it did.
// Never blocks the response — the deletion itself already succeeded via the cascade in the
// overwhelmingly common case; this is a monitoring net, not a retry gate.
async function verifyFullyDeleted(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const checks: { table: string; filter: string }[] = [
    { table: 'profiles', filter: `id.eq.${userId}` },
    { table: 'profile_attributes', filter: `user_id.eq.${userId}` },
    { table: 'connections', filter: `user_a.eq.${userId},user_b.eq.${userId}` },
    { table: 'connection_requests', filter: `sender_id.eq.${userId},receiver_id.eq.${userId}` },
    { table: 'reveal_requests', filter: `requester_id.eq.${userId},target_id.eq.${userId}` },
    { table: 'blocks', filter: `blocker_id.eq.${userId},target_id.eq.${userId}` },
    { table: 'reports', filter: `reporter_id.eq.${userId},target_id.eq.${userId}` },
    { table: 'messages', filter: `sender_id.eq.${userId}` },
    { table: 'device_push_tokens', filter: `user_id.eq.${userId}` },
    { table: 'overlap_cache', filter: `user_a.eq.${userId},user_b.eq.${userId}` },
    { table: 'card_bio_cache', filter: `user_id.eq.${userId}` },
    { table: 'session_events', filter: `user_id.eq.${userId}` },
    { table: 'message_reads', filter: `user_id.eq.${userId}` },
    { table: 'ai_bio_requests', filter: `user_id.eq.${userId}` },
    { table: 'scope_members', filter: `user_id.eq.${userId}` },
  ];

  const leftovers: string[] = [];

  for (const { table, filter } of checks) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).or(filter);
    if (error) {
      // A missing/renamed table shows up here too — treat that as worth knowing about as well.
      leftovers.push(`${table}: check failed (${error.message})`);
    } else if (count && count > 0) {
      leftovers.push(`${table}: ${count} row(s) remain`);
    }
  }

  if (leftovers.length > 0) {
    console.error(
      `delete-account: VERIFICATION FAILED for user ${userId} — cascade did not fully clear this account:`,
      leftovers.join('; ')
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData } = await callerClient.auth.getUser();
    const userId = callerData.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: profile } = await admin.from('profiles').select('is_demo').eq('id', userId).maybeSingle();
    if (profile?.is_demo) {
      return new Response(
        JSON.stringify({ error: "Demo account can't be deleted." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Storage first — not covered by any DB cascade, and harmless to retry if a later step
    // fails (an account with no photo but a still-live login is a fine retry state).
    const { data: files, error: listError } = await admin.storage.from('avatars').list(userId);
    if (listError) {
      console.error('delete-account: storage list failed', listError);
      return new Response(JSON.stringify({ error: 'Could not delete account. Please try again.' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await admin.storage.from('avatars').remove(paths);
      if (removeError) {
        console.error('delete-account: storage remove failed', removeError);
        return new Response(JSON.stringify({ error: 'Could not delete account. Please try again.' }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Last step, deliberately: everything else this user owns cascades away with this single
    // delete. If this fails, storage is already clean and nothing else was touched — safe to
    // just retry the whole request.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('delete-account: auth deleteUser failed', deleteError);
      return new Response(JSON.stringify({ error: 'Could not delete account. Please try again.' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    await verifyFullyDeleted(admin, userId);

    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error('delete-account: unexpected error', err);
    return new Response(JSON.stringify({ error: 'Could not delete account. Please try again.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
