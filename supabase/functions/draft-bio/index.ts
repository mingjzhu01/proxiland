// "Draft with AI" on the profile screen. Two steps:
//   A. Web search for the named person, draft a bio ONLY from what's actually found.
//   B. Fallback: draft a bio purely from the structured fields already entered, when A
//      can't confidently confirm it found the right person (or the user says "not me").
//
// Nothing from either step is persisted server-side — only the final text the user
// chooses to keep and saves via the normal profile save flow ends up in the database.
// This function itself stores nothing but a bare rate-limit timestamp.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { askModel } from '../_shared/ai.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Settings for this function specifically — independently tunable from the shared
// ANTHROPIC_MODEL default (e.g. to test Sonnet here without affecting every other
// function), per _shared/ai.ts's model/webSearchMaxUses per-call overrides.
const DRAFT_BIO_MODEL = Deno.env.get('DRAFT_BIO_MODEL') || undefined;
const DRAFT_BIO_WEB_SEARCH_MAX_USES = Number(Deno.env.get('DRAFT_BIO_WEB_SEARCH_MAX_USES') ?? '3');
const RATE_LIMIT_PER_HOUR = 5;
const SEARCH_TIMEOUT_MS = 25000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type RequestBody = {
  name?: string;
  school?: string;
  gradYear?: string;
  advancedDegree?: string;
  employer?: string;
  title?: string;
  role?: string;
  industry?: string;
  seniority?: string;
  skipSearch?: boolean;
};

type SearchResult = {
  status: 'found' | 'not_found' | 'ambiguous';
  matched_identity: string;
  bio: string;
  sources: string[];
  title: string | null;
  employer: string | null;
  undergrad_school: string | null;
  advanced_degree_school: string | null;
  advanced_degree_type: string | null;
  linkedin_url: string | null;
};

type FallbackResult = { bio: string };

// With web search enabled, Claude often narrates itself first ("I'll search for...")
// before its final JSON answer — askModel concatenates all text blocks together, so that
// preamble ends up glued onto the real JSON. Extract the JSON object from wherever it
// appears in the text, rather than assuming the whole string is JSON.
function parseModelJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

function buildSearchPrompt(body: RequestBody): string {
  return `You research a person online and draft a short professional bio. Rules: Use ONLY facts you actually find in search results that clearly refer to this specific person. Never guess, embellish, or merge results about different people with similar names. If results are sparse or you cannot confidently confirm it is the same person, say so instead of writing a bio. Never include contact details, home location, family, or anything not professional. Output ONLY valid JSON, no markdown fences, in this shape:
{ "status": "found" | "not_found" | "ambiguous",
  "matched_identity": string,        // one line describing who you believe you found, e.g. "Ming Zhu, Senior Manager at Nourish Ventures, Singapore", empty if not_found
  "bio": string,                     // 2 to 3 sentences, third person, empty unless status is found
  "sources": string[],               // up to 3 URLs you relied on, empty if none
  "title": string | null,            // their current job title, only if found, else null
  "employer": string | null,         // their current employer, only if found, else null
  "undergrad_school": string | null, // their undergraduate school, only if found, else null
  "advanced_degree_school": string | null, // school for any graduate/advanced degree, only if found, else null
  "advanced_degree_type": string | null,   // one of "Masters", "MBA", "PhD" if a graduate degree was found and clearly fits one of those, else null
  "linkedin_url": string | null            // their LinkedIn profile URL (e.g. "https://www.linkedin.com/in/username"), only if you actually found one in search results, else null — never guess or construct one
}

Name: ${body.name}. Undergrad: ${body.school ?? ''} ${body.gradYear ?? ''}. Employer: ${body.employer ?? ''}. Title: ${body.title ?? ''}. Search for this person and follow the rules.`;
}

function buildFallbackPrompt(body: RequestBody): string {
  return `You write a short professional bio from structured profile fields. Rules: Use ONLY the fields provided. Do not invent employers, schools, accomplishments, dates, or anything not given. Skip any field that is empty rather than guessing. Write 1 to 3 sentences, third person, plain and confident, no cliches like 'seasoned professional' or 'passionate about'. Output ONLY valid JSON, no markdown fences, in this shape:
{ "bio": string }

Name: ${body.name}. Role: ${body.role ?? ''}. Industry: ${body.industry ?? ''}. Seniority: ${body.seniority ?? ''}. Undergrad: ${body.school ?? ''} ${body.gradYear ?? ''}. Advanced degree: ${body.advancedDegree ?? ''}. Employer: ${body.employer ?? ''}. Title: ${body.title ?? ''}.`;
}

async function runFallback(body: RequestBody): Promise<Response> {
  try {
    const raw = await askModel(buildFallbackPrompt(body), { maxTokens: 512, model: DRAFT_BIO_MODEL });
    const parsed = parseModelJson(raw) as FallbackResult;
    if (!parsed || typeof parsed.bio !== 'string' || !parsed.bio.trim()) {
      return new Response(JSON.stringify({ status: 'error' }), { status: 200, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ status: 'fallback', bio: parsed.bio.trim() }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ status: 'error' }), { status: 200, headers: corsHeaders });
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

    const body: RequestBody = await req.json();
    const name = body.name?.trim();
    const hasSchool = !!body.school?.trim();
    const hasEmployer = !!body.employer?.trim();

    if (!name || !(hasSchool || hasEmployer)) {
      return new Response(
        JSON.stringify({ error: 'name is required, plus at least one of school or employer' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { count } = await admin
      .from('ai_bio_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', callerId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: 'Rate limit: max 5 AI bio drafts per hour. Try again later.' }),
        { status: 429, headers: corsHeaders }
      );
    }

    // Reserve the slot up front — every call to this endpoint counts, regardless of
    // outcome, so retries can't be used to hammer past the limit for free.
    const { error: insertError } = await admin.from('ai_bio_requests').insert({ user_id: callerId });
    if (insertError) {
      // Fail loudly rather than silently: an unrecorded call would mean the rate limit
      // quietly stops meaning anything (this is exactly what happened before this check
      // was added — the insert was failing without anyone noticing).
      return new Response(JSON.stringify({ error: `Rate-limit tracking failed: ${insertError.message}` }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (body.skipSearch) {
      return await runFallback(body);
    }

    try {
      const raw = await askModel(buildSearchPrompt(body), {
        maxTokens: 1024,
        enableWebSearch: true,
        webSearchMaxUses: DRAFT_BIO_WEB_SEARCH_MAX_USES,
        model: DRAFT_BIO_MODEL,
        timeoutMs: SEARCH_TIMEOUT_MS,
      });
      const parsed = parseModelJson(raw) as SearchResult;

      if (parsed?.status === 'found' && typeof parsed.bio === 'string' && parsed.bio.trim()) {
        const degreeType = ['Masters', 'MBA', 'PhD'].includes(parsed.advanced_degree_type as string)
          ? (parsed.advanced_degree_type as string)
          : null;
        // Sanity-check it's actually a linkedin.com URL rather than trusting the model's
        // claim outright — cheap guard against a malformed or unrelated link slipping in.
        const linkedinUrl =
          typeof parsed.linkedin_url === 'string' && /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(parsed.linkedin_url.trim())
            ? parsed.linkedin_url.trim()
            : null;
        return new Response(
          JSON.stringify({
            status: 'found',
            matched_identity: parsed.matched_identity ?? '',
            bio: parsed.bio.trim(),
            sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 3) : [],
            title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : null,
            employer: typeof parsed.employer === 'string' && parsed.employer.trim() ? parsed.employer.trim() : null,
            undergrad_school:
              typeof parsed.undergrad_school === 'string' && parsed.undergrad_school.trim()
                ? parsed.undergrad_school.trim()
                : null,
            advanced_degree_school:
              typeof parsed.advanced_degree_school === 'string' && parsed.advanced_degree_school.trim()
                ? parsed.advanced_degree_school.trim()
                : null,
            advanced_degree_type: degreeType,
            linkedin_url: linkedinUrl,
          }),
          { status: 200, headers: corsHeaders }
        );
      }
      // status is not_found / ambiguous, or shape was unexpected — fall through to Step B.
    } catch {
      // Web search call failed or timed out — fall through to Step B.
    }

    return await runFallback(body);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
