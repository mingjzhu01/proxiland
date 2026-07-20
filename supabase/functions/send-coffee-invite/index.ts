import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function buildIcs(opts: {
  uid: string;
  start: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  attendees: { name: string; email: string }[];
}): string {
  const end = new Date(opts.start.getTime() + 30 * 60000);
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Proxiland//Coffee Meetup//EN',
    'VERSION:2.0',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@proxiland.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(opts.start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(opts.summary)}`,
    opts.location ? `LOCATION:${escapeIcs(opts.location)}` : undefined,
    opts.description ? `DESCRIPTION:${escapeIcs(opts.description)}` : undefined,
    'ORGANIZER;CN=Proxiland:mailto:onboarding@resend.dev',
    ...opts.attendees.map(
      (a) => `ATTENDEE;CN=${escapeIcs(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`
    ),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => Boolean(line));
  return lines.join('\r\n');
}

function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

async function sendEmail(to: string, subject: string, html: string, icsContent: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Proxiland <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      attachments: [{ filename: 'invite.ics', content: toBase64(icsContent) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
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
    const callerId = callerData.user?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { requestId } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: request, error: requestError } = await admin
      .from('connection_requests')
      .select('id, sender_id, receiver_id, type, status, message, meeting_location, meeting_at')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (callerId !== request.sender_id && callerId !== request.receiver_id) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    if (request.type !== 'coffee' || request.status !== 'accepted' || !request.meeting_at) {
      return new Response(
        JSON.stringify({ skipped: 'not an accepted, scheduled coffee request' }),
        { status: 200, headers: corsHeaders }
      );
    }

    const userA = request.sender_id < request.receiver_id ? request.sender_id : request.receiver_id;
    const userB = request.sender_id < request.receiver_id ? request.receiver_id : request.sender_id;

    const { data: connection } = await admin
      .from('connections')
      .select('id')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();

    if (!connection) {
      return new Response(
        JSON.stringify({ skipped: 'sender and receiver are not connected yet' }),
        { status: 200, headers: corsHeaders }
      );
    }

    const [{ data: senderProfile }, { data: receiverProfile }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', request.sender_id).single(),
      admin.from('profiles').select('full_name').eq('id', request.receiver_id).single(),
    ]);

    const [{ data: senderAuth }, { data: receiverAuth }] = await Promise.all([
      admin.auth.admin.getUserById(request.sender_id),
      admin.auth.admin.getUserById(request.receiver_id),
    ]);

    const senderEmail = senderAuth.user?.email;
    const receiverEmail = receiverAuth.user?.email;
    const senderName = senderProfile?.full_name ?? 'Someone';
    const receiverName = receiverProfile?.full_name ?? 'Someone';

    if (!senderEmail || !receiverEmail) {
      return new Response(JSON.stringify({ error: 'Missing email for one or both users' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const meetingAt = new Date(request.meeting_at);
    const summary = `Coffee: ${senderName} & ${receiverName}`;
    const icsContent = buildIcs({
      uid: request.id,
      start: meetingAt,
      summary,
      location: request.meeting_location,
      description: request.message,
      attendees: [
        { name: senderName, email: senderEmail },
        { name: receiverName, email: receiverEmail },
      ],
    });

    const timeStr = meetingAt.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const html = `
      <p>Your coffee meetup is confirmed via Proxiland.</p>
      <p><strong>When:</strong> ${timeStr}</p>
      ${request.meeting_location ? `<p><strong>Where:</strong> ${request.meeting_location}</p>` : ''}
      ${request.message ? `<p><strong>Note:</strong> ${request.message}</p>` : ''}
      <p>A calendar invite is attached.</p>
    `;

    await Promise.all([
      sendEmail(senderEmail, `Coffee with ${receiverName}`, html, icsContent),
      sendEmail(receiverEmail, `Coffee with ${senderName}`, html, icsContent),
    ]);

    return new Response(JSON.stringify({ sent: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
