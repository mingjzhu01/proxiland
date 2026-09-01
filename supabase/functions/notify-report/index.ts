// Fires (best-effort, client-invoked right after the report row is inserted — same pattern
// as send-push and send-coffee-invite) to email the founder whenever someone submits a
// report. Re-derives the report's own data server-side from reportId rather than trusting
// whatever the client sends, so a tampered payload can't spoof a fake notification.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const REPORT_NOTIFICATION_EMAIL = Deno.env.get('REPORT_NOTIFICATION_EMAIL')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const REASON_LABELS: Record<string, string> = {
  impersonation: 'Impersonation',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate content',
  spam: 'Spam',
  other: 'Other',
};

// full_name and details are user-typed text — escape before interpolating into HTML, or a
// report's own content could inject markup/scripts into the notification email itself.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    if (!callerData.user?.id) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { reportId } = await req.json();
    if (typeof reportId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing reportId' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: report, error: reportError } = await admin
      .from('reports')
      .select('reporter_id, target_id, context, reason, details, created_at')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // The caller must actually be the reporter on this row — otherwise anyone could trigger
    // an email for any report id.
    if (report.reporter_id !== callerData.user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const [{ data: reporterProfile }, { data: targetProfile }] = await Promise.all([
      admin.from('profiles').select('full_name, is_demo').eq('id', report.reporter_id).maybeSingle(),
      admin.from('profiles').select('full_name, is_demo').eq('id', report.target_id).maybeSingle(),
    ]);

    const isDemo = !!reporterProfile?.is_demo || !!targetProfile?.is_demo;
    const subjectPrefix = isDemo ? '[DEMO] ' : '';

    const reporterName = escapeHtml(reporterProfile?.full_name ?? 'Unknown');
    const targetName = escapeHtml(targetProfile?.full_name ?? 'Unknown');
    const reasonLabel = escapeHtml(REASON_LABELS[report.reason] ?? report.reason);

    const html = `
      <p><strong>${subjectPrefix}New report on Proxiland</strong></p>
      <p><strong>Reporter:</strong> ${reporterName} (${report.reporter_id})</p>
      <p><strong>Reported user:</strong> ${targetName} (${report.target_id})</p>
      <p><strong>Context:</strong> ${escapeHtml(report.context)}</p>
      <p><strong>Reason:</strong> ${reasonLabel}</p>
      ${report.details ? `<p><strong>Details:</strong> ${escapeHtml(report.details)}</p>` : ''}
      <p><strong>Submitted:</strong> ${report.created_at}</p>
      ${isDemo ? '<p><em>One or both accounts involved are flagged as demo/review accounts.</em></p>' : ''}
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Proxiland <onboarding@resend.dev>',
        to: [REPORT_NOTIFICATION_EMAIL],
        subject: `${subjectPrefix}New Proxiland report: ${REASON_LABELS[report.reason] ?? report.reason}`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({ error: `Resend error ${res.status}: ${body}` }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ sent: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
