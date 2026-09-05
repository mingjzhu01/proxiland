// v2 event mode: ranks fellow event attendees against the caller's own structured intent
// (event_intents.ask_tags/offer_tags, migration 0058) for this event. Mirrors phrase-overlap's
// shape (deterministic prep -> askModel() -> validate -> cache), because that pattern is
// already proven in this codebase.
//
// Eligibility (eligible_event_candidates, migration 0058) is computed in SQL and can never be
// overridden by the AI — the AI only ranks within that already-safe, already-complete
// candidate set. The deterministic ask/offer complement scoring, however, lives HERE (not in
// SQL) so the compatibility map only needs to exist in one server-side file
// (_shared/eventIntentTaxonomy.ts) rather than being re-expressed in SQL too.
//
// If the AI call fails or returns something unparseable, everyone still gets a ranking from
// the deterministic weighted feature score alone (see buildFallbackReason below) — the
// feature is never fully broken by an AI outage.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { askModel } from '../_shared/ai.ts';
import { labelsForAsk, labelsForOffer, intentComplement } from '../_shared/eventIntentTaxonomy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Open item from v2-implementation-plan.md ("AI batch size for match ranking... will tune
// based on real prompt-length testing") — 20 is a starting point, not a tuned value.
// Candidates beyond this are still included in the results, just deterministic-only.
const AI_BATCH_SIZE = 20;

type RawCandidate = {
  candidate_user_id: string;
  candidate_ask_tags: string[] | null;
  candidate_offer_tags: string[] | null;
  professional_overlap: number;
  context_trust: number;
};

type Candidate = {
  candidate_user_id: string;
  intent_complement: number;
  reciprocal_relevance: number;
  professional_overlap: number;
  context_trust: number;
};

type Weights = {
  intent_complement: number;
  reciprocal_relevance: number;
  professional_overlap: number;
  context_trust: number;
};

function deterministicScore(c: Candidate, w: Weights): number {
  return (
    c.intent_complement * w.intent_complement +
    c.reciprocal_relevance * w.reciprocal_relevance +
    c.professional_overlap * w.professional_overlap +
    c.context_trust * w.context_trust
  );
}

function buildFallbackReason(c: Candidate): string {
  const entries: [string, number][] = [
    ['intent_complement', c.intent_complement],
    ['reciprocal_relevance', c.reciprocal_relevance],
    ['professional_overlap', c.professional_overlap],
    ['context_trust', c.context_trust],
  ];
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  if (top[1] <= 0) return 'A potential connection at this event.';
  switch (top[0]) {
    case 'intent_complement':
      return 'What they can offer may match what you\'re looking for.';
    case 'reciprocal_relevance':
      return 'What you\'re each looking for lines up well.';
    case 'professional_overlap':
      return 'You share a similar professional background.';
    default:
      return 'A potential connection at this event.';
  }
}

type PersonForPrompt = {
  askLabels: string[];
  askDetailText: string | null;
  offerLabels: string[];
  offerDetailText: string | null;
  role_category: string | null;
  industry: string | null;
  stage: string | null;
  headline: string | null;
  employer: string | null;
  title: string | null;
};

function describePerson(label: string, p: PersonForPrompt): string {
  const lines = [
    `${label}:`,
    p.title || p.employer ? `Role: ${[p.title, p.employer].filter(Boolean).join(' at ')}` : null,
    p.headline ? `Headline: ${p.headline}` : null,
    p.role_category ? `Role category: ${p.role_category}` : null,
    p.industry ? `Industry: ${p.industry}` : null,
    p.stage ? `Company stage: ${p.stage}` : null,
    p.askLabels.length > 0
      ? `Looking for: ${p.askLabels.join(', ')}${p.askDetailText ? ` (${p.askDetailText})` : ''}`
      : null,
    p.offerLabels.length > 0
      ? `Can offer: ${p.offerLabels.join(', ')}${p.offerDetailText ? ` (${p.offerDetailText})` : ''}`
      : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildPrompt(caller: PersonForPrompt, candidates: PersonForPrompt[]): string {
  return `You are ranking potential connections for someone ("You") at a professional networking event, based on what each person is looking for and what they can offer.

${describePerson('You', caller)}

Candidates:
${candidates.map((c, i) => `Candidate ${i + 1}:\n${describePerson('', c)}`).join('\n\n')}

For each candidate, assess how good a match they are for "You" — consider whether what they offer matches what You want (and vice versa), complementary professional backgrounds, and genuine value of the connection.

Rules:
- Only use facts explicitly stated above. Never invent, infer, or embellish anything not written.
- Write each reason directly to "You" (e.g. "They can..."), one sentence, 20 words or fewer.
- Include every candidate exactly once, using their number above.

Respond with ONLY this JSON shape, nothing else:
[{"candidate": 1, "score": 0, "reason": ""}]`;
}

function parseModelJson(
  text: string,
  count: number
): { candidate: number; score: number; reason: string }[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const seen = new Set<number>();
    const out: { candidate: number; score: number; reason: string }[] = [];
    for (const entry of parsed) {
      const candidate = Number(entry?.candidate);
      const score = Number(entry?.score);
      const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
      if (!Number.isInteger(candidate) || candidate < 1 || candidate > count) continue;
      if (seen.has(candidate)) continue;
      if (!Number.isFinite(score)) continue;
      seen.add(candidate);
      out.push({ candidate, score: Math.max(0, Math.min(100, score)), reason });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function isSafeReason(reason: string): boolean {
  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  return wordCount > 0 && wordCount <= 30;
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

    const { scope_id: scopeId } = await req.json();
    if (typeof scopeId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing scope_id' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Runs with the caller's own JWT — eligible_event_candidates is security definer and
    // relies on auth.uid() for its "are you actually a member" check, so this must go
    // through the caller's own client, not the admin client (whose auth.uid() would be null).
    const { data: rawCandidates, error: candidatesError } = await callerClient.rpc(
      'eligible_event_candidates',
      { p_scope_id: scopeId }
    );
    if (candidatesError) {
      return new Response(JSON.stringify({ error: candidatesError.message }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!rawCandidates || rawCandidates.length === 0) {
      const { data: run, error: runError } = await admin
        .from('match_runs')
        .insert({ scope_id: scopeId, user_id: callerId, status: 'deterministic_fallback' })
        .select('id')
        .single();
      if (runError) {
        return new Response(JSON.stringify({ error: runError.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }
      await admin.from('match_recommendations').delete().eq('scope_id', scopeId).eq('source_user_id', callerId);
      return new Response(JSON.stringify({ count: 0, run_id: run.id }), { status: 200, headers: corsHeaders });
    }

    // The caller's own ask/offer tags are needed to score every candidate — eligibility
    // already required the CALLER to be a member, but not necessarily to have completed
    // their own intent (they might be visiting Matches before finishing it, though the app
    // gates that screen behind completion — this is the server-side backstop either way).
    const { data: callerIntentRow } = await admin
      .from('event_intents')
      .select('ask_tags, offer_tags, ask_text, offer_text')
      .eq('scope_id', scopeId)
      .eq('user_id', callerId)
      .maybeSingle();
    const callerAskTags: string[] = callerIntentRow?.ask_tags ?? [];
    const callerOfferTags: string[] = callerIntentRow?.offer_tags ?? [];

    const candidates: Candidate[] = (rawCandidates as RawCandidate[]).map((c) => {
      const candidateAsk = c.candidate_ask_tags ?? [];
      const candidateOffer = c.candidate_offer_tags ?? [];
      const candidateHelpsMe = intentComplement(callerAskTags, candidateOffer);
      const iHelpCandidate = intentComplement(candidateAsk, callerOfferTags);
      return {
        candidate_user_id: c.candidate_user_id,
        intent_complement: candidateHelpsMe,
        reciprocal_relevance: (candidateHelpsMe + iHelpCandidate) / 2,
        professional_overlap: c.professional_overlap,
        context_trust: c.context_trust,
      };
    });

    const { data: weightsRows } = await admin.rpc('get_match_weights');
    const weights: Weights = weightsRows?.[0] ?? {
      intent_complement: 0.4,
      reciprocal_relevance: 0.3,
      professional_overlap: 0.2,
      context_trust: 0.1,
    };

    const ranked = [...candidates].sort(
      (a, b) => deterministicScore(b, weights) - deterministicScore(a, weights)
    );
    const batch = ranked.slice(0, AI_BATCH_SIZE);
    const overflow = ranked.slice(AI_BATCH_SIZE);

    const [{ data: callerAttrs }, { data: callerProfile }] = await Promise.all([
      admin.from('profile_attributes').select('*').eq('user_id', callerId).maybeSingle(),
      admin.from('profiles').select('headline, employer, title').eq('id', callerId).maybeSingle(),
    ]);

    const batchIds = batch.map((c) => c.candidate_user_id);
    const [{ data: batchIntents }, { data: batchAttrs }, { data: batchProfiles }] = await Promise.all([
      admin.from('event_intents').select('*').eq('scope_id', scopeId).in('user_id', batchIds),
      admin.from('profile_attributes').select('*').in('user_id', batchIds),
      admin.from('profiles').select('id, headline, employer, title').in('id', batchIds),
    ]);

    function toPerson(
      intent: Record<string, unknown> | null | undefined,
      attrs: Record<string, unknown> | null | undefined,
      profile: Record<string, unknown> | null | undefined
    ): PersonForPrompt {
      return {
        askLabels: labelsForAsk((intent?.ask_tags as string[] | null) ?? null),
        askDetailText: (intent?.ask_text as string) ?? null,
        offerLabels: labelsForOffer((intent?.offer_tags as string[] | null) ?? null),
        offerDetailText: (intent?.offer_text as string) ?? null,
        role_category: (attrs?.role_category as string) ?? null,
        industry: (attrs?.industry as string) ?? null,
        stage: (attrs?.stage as string) ?? null,
        headline: (profile?.headline as string) ?? null,
        employer: (profile?.employer as string) ?? null,
        title: (profile?.title as string) ?? null,
      };
    }

    const callerPerson = toPerson(callerIntentRow, callerAttrs, callerProfile);
    const batchPeople = batch.map((c) =>
      toPerson(
        (batchIntents ?? []).find((r: any) => r.user_id === c.candidate_user_id),
        (batchAttrs ?? []).find((r: any) => r.user_id === c.candidate_user_id),
        (batchProfiles ?? []).find((r: any) => r.id === c.candidate_user_id)
      )
    );

    let aiResults: { candidate: number; score: number; reason: string }[] | null = null;
    try {
      const raw = await askModel(buildPrompt(callerPerson, batchPeople), {
        maxTokens: 4096,
        timeoutMs: 30000,
      });
      aiResults = parseModelJson(raw, batch.length);
      if (!aiResults) {
        console.error('generate-event-matches: parseModelJson returned null for raw response:', raw);
      }
    } catch (err) {
      console.error('generate-event-matches: askModel threw:', err);
      aiResults = null;
    }

    const runStatus = aiResults ? 'ai' : 'deterministic_fallback';
    const { data: run, error: runError } = await admin
      .from('match_runs')
      .insert({ scope_id: scopeId, user_id: callerId, status: runStatus })
      .select('id')
      .single();
    if (runError) {
      return new Response(JSON.stringify({ error: runError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const rows = ranked.map((c) => {
      const detScore = deterministicScore(c, weights);
      const aiEntry = aiResults
        ? aiResults.find((r) => batch[r.candidate - 1]?.candidate_user_id === c.candidate_user_id)
        : undefined;
      const finalScore =
        aiEntry !== undefined ? 0.6 * (aiEntry.score / 100) + 0.4 * detScore : detScore;
      const reason = aiEntry && isSafeReason(aiEntry.reason) ? aiEntry.reason : buildFallbackReason(c);

      return {
        match_run_id: run.id,
        scope_id: scopeId,
        source_user_id: callerId,
        candidate_user_id: c.candidate_user_id,
        score: Math.round(finalScore * 1000) / 1000,
        intent_complement: c.intent_complement,
        reciprocal_relevance: c.reciprocal_relevance,
        professional_overlap: c.professional_overlap,
        context_trust: c.context_trust,
        match_reason: reason,
      };
    });

    await admin.from('match_recommendations').delete().eq('scope_id', scopeId).eq('source_user_id', callerId);
    const { error: insertError } = await admin.from('match_recommendations').insert(rows);
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({ count: rows.length, run_id: run.id, status: runStatus, overflow: overflow.length }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
