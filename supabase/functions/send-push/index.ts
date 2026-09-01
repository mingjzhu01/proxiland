// Project Buzz: fires a real push notification when someone sends a connect/reveal/coffee
// request. Called best-effort by the client right after the underlying request is actually
// created (createRevealRequest / sendRequest) — never blocks or fails that action if push
// fails, same pattern already used for send-coffee-invite.
//
// Deliberately does NOT accept free-text title/body from the client: any signed-in caller
// could otherwise push arbitrary text to any other user's phone. Instead it only accepts a
// fixed `kind`, looks up the caller's own name server-side, and builds the notification text
// itself.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type Kind = 'connect_request' | 'reveal_request' | 'coffee_request' | 'chat_message';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function messageFor(
  kind: Kind,
  senderName: string,
  messagePreview: string | null
): { title: string; body: string } {
  switch (kind) {
    case 'reveal_request':
      return { title: 'Proxiland', body: `${senderName} wants to connect` };
    case 'coffee_request':
      return { title: 'Proxiland', body: `${senderName} wants to grab coffee` };
    case 'chat_message':
      return { title: senderName, body: messagePreview ?? 'Sent you a message' };
    case 'connect_request':
    default:
      return { title: 'Proxiland', body: `${senderName} wants to connect` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { targetUserId, kind, messageId } = await req.json();
    if (!targetUserId || !kind) {
      return new Response(JSON.stringify({ error: 'targetUserId and kind are required' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData } = await callerClient.auth.getUser();
    const callerId = callerData.user?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // chat_message never trusts client-supplied text — look up the real row and confirm the
    // caller actually sent it, so nobody can spoof a push claiming to be a message they never
    // sent.
    let messagePreview: string | null = null;
    if (kind === 'chat_message') {
      if (typeof messageId !== 'string') {
        return new Response(JSON.stringify({ error: 'messageId is required for chat_message' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      const { data: message } = await admin.from('messages').select('sender_id, body').eq('id', messageId).maybeSingle();
      if (!message || message.sender_id !== callerId) {
        return new Response(JSON.stringify({ error: 'Not authorized' }), {
          status: 403,
          headers: corsHeaders,
        });
      }
      messagePreview = truncate(message.body, 120);
    }

    const [{ data: sender }, { data: tokenRows }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', callerId).maybeSingle(),
      admin.from('device_push_tokens').select('push_token').eq('user_id', targetUserId),
    ]);

    if (!tokenRows || tokenRows.length === 0) {
      // Target has no registered device — nothing to send, not an error.
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    const { title, body } = messageFor(kind as Kind, sender?.full_name ?? 'Someone', messagePreview);

    const messages = tokenRows.map((r) => ({
      to: r.push_token as string,
      title,
      body,
      sound: 'default',
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return new Response(JSON.stringify({ error: `Expo push API error ${res.status}: ${errBody}` }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ sent: messages.length }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
