// Spec v4, section 13 job 3 ("shared connections"), revised after live testing: the
// original design used a fixed SQL matcher (find_overlap) checking a hardcoded list of
// fields — former employer, school, industry, stated wants/offers — which missed anything
// outside that list (e.g. a shared hometown mentioned only in free-text bios) and required
// predicting every field worth matching on in advance.
//
// This version hands the model BOTH people's complete profile — every structured field
// plus their full bio, looking_for, and can_offer text, whatever they actually wrote — and
// lets it find the single strongest genuine overlap itself, not limited to a preset
// checklist. Detection and phrasing now happen in one model call instead of two steps
// (free SQL match, then AI phrasing) — the real tradeoff of going open-ended: this always
// calls the model, it can no longer skip the call for free when a SQL check finds nothing.
// Caching per pair (keyed by a fingerprint of both people's relevant fields, same pattern
// as elsewhere) keeps this to once per relationship rather than once per view, same cost
// discipline the original design was built around.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { askModel } from '../_shared/ai.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const NONE_SENTINEL = 'NONE';

// Loose safety net, not a strict fact-check (open-ended reasoning can't be verified the
// same way a template rewrite can) — blocks the most obvious ways this could drift toward
// the exact tone the spec explicitly rules out (section 5: "never a business opportunity";
// no meeting prompts, ever).
const BLOCKED_PHRASES = [
  'meet', 'invest', 'business opportunity', 'deal', 'pitch', 'funding', 'raise capital',
];

type ProfileForPrompt = {
  role_category: string | null;
  industry: string | null;
  stage: string | null;
  school: string | null;
  prior_employer: string | null;
  tenure_band: string | null;
  hometown: string | null;
  looking_for: string | null;
  can_offer: string | null;
  bio: string | null;
};

function describeProfile(label: string, p: ProfileForPrompt): string {
  const lines = [
    `${label}:`,
    p.role_category ? `Role: ${p.role_category}` : null,
    p.industry ? `Industry: ${p.industry}` : null,
    p.stage ? `Company stage: ${p.stage}` : null,
    p.school ? `School: ${p.school}` : null,
    p.prior_employer ? `Prior employer: ${p.prior_employer}` : null,
    p.tenure_band ? `Years of experience: ${p.tenure_band}` : null,
    p.hometown ? `Hometown: ${p.hometown}` : null,
    p.looking_for ? `Looking for: ${p.looking_for}` : null,
    p.can_offer ? `Can offer: ${p.can_offer}` : null,
    p.bio ? `Bio: ${p.bio}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildPrompt(a: ProfileForPrompt, b: ProfileForPrompt): string {
  return `You are comparing two professional networking-app profiles to find something genuine they have in common — anything at all: same school, same hometown, same former employer, complementary looking-for/can-offer, a shared detail mentioned in their bios, or anything else explicitly stated below.

${describeProfile('Person A', a)}

${describeProfile('Person B', b)}

Rules:
- Only use facts explicitly stated above. Never invent, infer, or embellish anything not written.
- Do not suggest they should meet, or use any commercial/sales language (never frame it as a business or investment opportunity).
- Do not compare seniority or hierarchy.
- If you find a genuine overlap, respond with ONLY one sentence, 25 words or fewer, describing it.
- If there is no genuine overlap, respond with exactly: ${NONE_SENTINEL}

Respond with ONLY the sentence or ${NONE_SENTINEL} — no prefix, no quotes, no markdown.`;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toProfileForPrompt(attrs: Record<string, unknown> | null, bio: string | null): ProfileForPrompt {
  return {
    role_category: (attrs?.role_category as string) ?? null,
    industry: (attrs?.industry as string) ?? null,
    stage: (attrs?.stage as string) ?? null,
    school: (attrs?.school as string) ?? null,
    prior_employer: (attrs?.prior_employer as string) ?? null,
    tenure_band: (attrs?.tenure_band as string) ?? null,
    hometown: (attrs?.hometown as string) ?? null,
    looking_for: (attrs?.looking_for as string) ?? null,
    can_offer: (attrs?.can_offer as string) ?? null,
    bio: bio?.trim() || null,
  };
}

function isSafe(sentence: string): boolean {
  const wordCount = sentence.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0 || wordCount > 25) return false;
  const lower = sentence.toLowerCase();
  return !BLOCKED_PHRASES.some((phrase) => lower.includes(phrase));
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

    const { other_user_id: otherUserId } = await req.json();
    if (typeof otherUserId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing other_user_id' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const userA = callerId < otherUserId ? callerId : otherUserId;
    const userB = callerId < otherUserId ? otherUserId : callerId;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const [{ data: attrsA }, { data: attrsB }, { data: profileA }, { data: profileB }] = await Promise.all([
      admin.from('profile_attributes').select('*').eq('user_id', userA).maybeSingle(),
      admin.from('profile_attributes').select('*').eq('user_id', userB).maybeSingle(),
      admin.from('profiles').select('bio').eq('id', userA).maybeSingle(),
      admin.from('profiles').select('bio').eq('id', userB).maybeSingle(),
    ]);

    if (!attrsA || !attrsB) {
      return new Response(JSON.stringify({ overlap: null }), { status: 200, headers: corsHeaders });
    }

    const personA = toProfileForPrompt(attrsA, profileA?.bio ?? null);
    const personB = toProfileForPrompt(attrsB, profileB?.bio ?? null);

    const fingerprint = await sha256(JSON.stringify([personA, personB]));

    const { data: cached } = await admin
      .from('overlap_cache')
      .select('overlap_type, phrase, source_fingerprint')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();

    if (cached && cached.source_fingerprint === fingerprint) {
      return new Response(JSON.stringify({ overlap: { overlap_type: cached.overlap_type, phrase: cached.phrase } }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const raw = (await askModel(buildPrompt(personA, personB), { maxTokens: 100 })).trim();

    if (raw === NONE_SENTINEL || !isSafe(raw)) {
      await admin.from('overlap_cache').delete().eq('user_a', userA).eq('user_b', userB);
      return new Response(JSON.stringify({ overlap: null }), { status: 200, headers: corsHeaders });
    }

    const { error: cacheError } = await admin.from('overlap_cache').upsert({
      user_a: userA,
      user_b: userB,
      overlap_type: 'ai_detected',
      phrase: raw,
      source_fingerprint: fingerprint,
    });

    if (cacheError) {
      return new Response(JSON.stringify({ error: cacheError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({ overlap: { overlap_type: 'ai_detected', phrase: raw } }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
