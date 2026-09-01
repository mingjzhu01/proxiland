// Spec v4, section 6 job 2b + section 13: polish-line.
//
// IMPORTANT boundary — read before touching this file: line_assembled/line_polished here
// are the caller's own profile headline (shown to themselves, and to connections once
// mutually revealed — see migration 0025's note on why this is treated as the caller's
// canonical self-view). This is DIFFERENT from what strangers see in the anonymous Nearby
// feed: individual_cards_for_scope (migration 0035) independently recomputes its own line
// from raw structured fields + that scope's k-anonymity suppression flags, and never reads
// line_polished at all. That separation is deliberate and must stay that way — this
// function is free to use the person's full bio for a richer headline specifically BECAUSE
// nothing here is ever shown to someone who hasn't already been mutually revealed to them.
// Do not wire this function's output into the anonymous feed.
//
// Hard rule that's non-negotiable: output must use only facts the person actually provided
// (now: structured fields + their own bio/looking_for/can_offer text, not just the 6-field
// template) — no inventing a company, school, or credential that isn't there. Verified after
// generation; on any failure, silently falls back to the plain assembled version.
//
// The spec's original "12 words or fewer" cap is deliberately loosened here (to ~20-22) —
// founder call: with 4+ facts to weave into natural prose instead of a comma list, a strict
// 12-word cap was causing frequent silent verification failures, invisibly falling back to
// the ugly template line far more often than intended. Prioritizing "reads well" over a
// strict count. Behind an on/off setting (AI_POLISH_ENABLED, default on).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { askModel } from '../_shared/ai.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_POLISH_ENABLED = (Deno.env.get('AI_POLISH_ENABLED') ?? 'true') === 'true';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const ALLOWED_CONNECTORS = new Set([
  'a', 'an', 'the', 'at', 'in', 'on', 'of', 'and', 'with', 'for', 'from', 'to',
  'is', 'was', 'were', 'now', 'currently', 'previously', 'formerly', 'ex',
  'grad', 'graduate', 'graduated', 'years', 'year', 'experience', 'plus', 'building',
  'built', 'leading', 'leads', 'led', 'across', 'building', 'based',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

// Only scrutinize tokens that could actually smuggle in a fabricated fact — a capitalized
// proper noun (a company/school name) or a standalone number (a year, a count) — against the
// approved word set. Ordinary lowercase descriptive/connecting prose is exempt: it can vary
// freely between regenerations without being able to invent a company, school, or credential.
// (Previously every single word had to literally appear in the source facts, which rejected
// almost all natural phrasing — e.g. "alum" instead of "grad" — and silently fell back to the
// same deterministic template on every regenerate, which is why regenerating looked like a
// no-op even though the model really was writing something different each time.)
function verifyNoInventedFacts(polished: string, approvedFacts: string[]): boolean {
  const approvedWords = new Set(approvedFacts.flatMap((f) => tokenize(f)));
  // Must split the same way tokenize() does (apostrophe as a separator, not a word character)
  // — otherwise a verbatim "School'22" copy becomes one glued token that can never match the
  // separately-tokenized "school" + "22" in approvedWords, rejecting the model for correctly
  // following the exact-formatting instruction.
  const rawWords = polished.match(/[A-Za-z0-9]+/g) ?? [];

  return rawWords.every((word, i) => {
    const lower = word.toLowerCase();
    if (approvedWords.has(lower) || ALLOWED_CONNECTORS.has(lower)) return true;
    const isNumber = /^\d+$/.test(word);
    const isProperNoun = i > 0 && /^[A-Z]/.test(word);
    return !isNumber && !isProperNoun;
  });
}

function yearSuffix(year: string | null | undefined): string {
  const trimmed = year?.trim();
  return trimmed ? `'${trimmed.slice(-2)}` : '';
}

// "School (Degree)'YY" is exact punctuation the founder wants verbatim — deterministic
// code, not left to the model to format correctly (same "ordinary code for anything
// mechanical" preference as assemble_line's own template rendering).
function formatEducation(v1Profile: Record<string, unknown> | null): string | null {
  if (!v1Profile) return null;
  const parts: string[] = [];

  const gradSchool = (v1Profile.grad_school as string)?.trim();
  if (gradSchool) {
    const degree = (v1Profile.grad_degree_type as string)?.trim();
    parts.push(`${gradSchool}${degree ? ` (${degree})` : ''}${yearSuffix(v1Profile.grad_year as string)}`);
  }

  const undergradSchool = (v1Profile.undergrad_school as string)?.trim();
  if (undergradSchool) {
    parts.push(`${undergradSchool}${yearSuffix(v1Profile.undergrad_year as string)}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

function describeFacts(profile: Record<string, unknown>, formattedEducation: string | null): string {
  const lines = [
    profile.role_category ? `Role: ${profile.role_category}` : null,
    profile.industry ? `Industry: ${profile.industry}` : null,
    profile.stage ? `Own company stage: ${profile.stage}` : null,
    // Prefer the exact, user-entered v1 education fields over the fuzzy AI-inferred
    // profile_attributes.school when available.
    formattedEducation ? `Education (use this EXACT formatting verbatim): ${formattedEducation}` : profile.school ? `School: ${profile.school}` : null,
    profile.prior_employer ? `Prior employer: ${profile.prior_employer}` : null,
    profile.tenure_years_exact
      ? `Years of experience: ${profile.tenure_years_exact}`
      : profile.tenure_band
        ? `Years of experience: ${profile.tenure_band}`
        : null,
    profile.hometown ? `Hometown: ${profile.hometown}` : null,
    profile.looking_for ? `Looking for: ${profile.looking_for}` : null,
    profile.can_offer ? `Can offer: ${profile.can_offer}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

// Asking the same model the same fact-constrained question tends to converge on one "best"
// phrasing regardless of sampling randomness (Anthropic's default temperature is already
// at its max) — so genuine variety between regenerations has to come from actually giving
// it a different angle to write from each time, not from hoping randomness helps.
//
// Founder preference: lead with current role/focus, education trailing, reads more like how
// a person would actually describe themselves rather than a credentials list — so this is
// tried FIRST on every generation (see the attempt loop below); the rest are only reached as
// a fallback if that one happens to fail verification, keeping regenerate from being a frozen
// duplicate without abandoning the preferred shape.
const PREFERRED_STYLE_ANGLE =
  'Lead with what they currently do or focus on day-to-day, then fold in their background as a trailing clause.';

const STYLE_ANGLES = [
  PREFERRED_STYLE_ANGLE,
  'Lead with years of experience as the opening modifier (e.g. "8-year foodtech investor...").',
  'Lead with their role and industry together as the opening phrase, saving credentials (school, prior employer) for the back half of the sentence.',
  'Lead with their single most impressive credential (top school or a notable prior employer), then their role.',
  'Structure it as two short clauses joined by "and" or a comma — role and experience first, then credentials second.',
];

function buildPrompt(facts: string, bio: string | null, styleAngle: string): string {
  return `Based on this person's profile information, write a compelling one-line professional headline for a networking app — the way a sharp person would actually describe themselves, not a comma-separated list of facts. Weave their profession and most notable credentials (education, experience, standout achievements) into a real, grammatically complete sentence — not keywords separated by commas, and never a dangling phrase that trails off without finishing its thought.

For this specific version, use this structure: ${styleAngle}

Years of experience specifically: never abbreviate as "Xy experience" or "Xyrs" — that reads as a typo, not a headline. Whether you lead with it or use a trailing clause, write it out properly ("8-year..." or "...with 8 years of experience").

What to avoid (regardless of which structure you're using above):
Bad (list of keywords, not a sentence): "Climate founder, MIT PhD grad, 6y experience"
Bad (dangling, doesn't finish the thought): "Climate founder building in the space, 6 years in, MIT PhD"
Do not include the person's own name — it's shown elsewhere, never as part of this line.
Do not add a region, market, or focus area (e.g. a continent or country) unless it's explicitly given below — leave it out rather than guessing.
If you state a number (a year, a count), copy it exactly as given below — don't reformat, round, or spell it out differently.

${facts}
${bio ? `\nFull bio: "${bio}"` : ''}

Use ONLY information given above — do not invent, infer, or embellish any company, school, title, achievement, geography, or figure not actually stated. Try to include every fact given above unless it genuinely doesn't fit into a natural sentence. If you include the education fact, use its exact formatting verbatim (including the parentheses and apostrophe-year), don't rephrase it. Output a single line, natural and well-written — prioritize it actually reading well over hitting an exact word count, but keep it to one line, roughly 20 words or fewer.

Respond with ONLY the headline. No quotes, no prefix, no markdown.`;
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const [{ data: profile, error: profileError }, { data: v1Profile }] = await Promise.all([
      admin.from('profile_attributes').select('*').eq('user_id', callerId).maybeSingle(),
      admin
        .from('profiles')
        .select('bio, grad_degree_type, grad_school, grad_year, undergrad_school, undergrad_year')
        .eq('id', callerId)
        .maybeSingle(),
    ]);

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'No profile_attributes row for caller' }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Plain template line — always computed as the safe fallback, and as the source of
    // truth for what the anonymous feed independently renders (see file header).
    const { data: assembledLine, error: assembleError } = await admin.rpc('assemble_line', {
      p_role_category: profile.role_category,
      p_industry: profile.industry,
      p_stage: profile.stage,
      p_school: profile.school,
      p_prior_employer: profile.prior_employer,
      p_tenure_band: profile.tenure_band,
      p_keep_industry: true,
      p_keep_stage: true,
      p_keep_school: true,
      p_keep_prior_employer: true,
      p_keep_tenure_band: true,
      p_used_generic: false,
      p_tenure_years_exact: profile.tenure_years_exact,
    });

    if (assembleError) {
      return new Response(JSON.stringify({ error: assembleError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    let linePolished: string | null = null;

    if (AI_POLISH_ENABLED) {
      const bio: string | null = v1Profile?.bio?.trim() || null;
      const formattedEducation = formatEducation(v1Profile);
      const facts = describeFacts(profile, formattedEducation);
      const approvedFacts = [facts, bio, assembledLine].filter((f): f is string => typeof f === 'string');

      // One retry before falling back to the deterministic template: a single verification
      // failure (the model adding a detail not in the approved facts) is common enough that
      // always falling back on the first miss made "regenerate" feel like it wasn't doing
      // anything — trying twice roughly squares the effective failure rate. The first attempt
      // always uses the founder-preferred style angle; only a retry after that one fails picks
      // a random angle from the rest.
      const MAX_ATTEMPTS = 2;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && linePolished === null; attempt++) {
        const styleAngle =
          attempt === 0
            ? PREFERRED_STYLE_ANGLE
            : STYLE_ANGLES[Math.floor(Math.random() * STYLE_ANGLES.length)];

        try {
          const raw = (await askModel(buildPrompt(facts, bio, styleAngle), { maxTokens: 80 })).trim();
          const wordCount = raw.split(/\s+/).filter(Boolean).length;

          if (wordCount <= 22 && verifyNoInventedFacts(raw, approvedFacts)) {
            linePolished = raw;
          }
          // Otherwise: try again (if attempts remain), then silently fall back —
          // linePolished stays null, client uses line_assembled instead, per the spec's
          // explicit fallback rule.
        } catch {
          // Model call failed — try again (if attempts remain), then same silent fallback.
        }
      }
    }

    const { data: saved, error: saveError } = await admin
      .from('profile_attributes')
      .update({ line_assembled: assembledLine, line_polished: linePolished })
      .eq('user_id', callerId)
      .select('line_assembled, line_polished')
      .single();

    if (saveError) {
      return new Response(JSON.stringify({ error: saveError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify(saved), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
