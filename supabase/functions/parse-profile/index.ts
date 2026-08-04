// Spec v4, section 13: "parse-profile" — runs at sign-up and when the profile changes.
// Job 1 from section 6: read whatever the person gives us (free text) and fill in the
// structured profile_attributes fields. Validates model output against the allowed value
// lists and rejects rather than coerces. Never overwrites a row where user_edited is true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { askModel } from '../_shared/ai.ts';
import {
  ROLE_CATEGORIES,
  SENIORITY_BANDS,
  INDUSTRIES,
  STAGES,
  TENURE_BANDS,
  type RoleCategory,
  type SeniorityBand,
  type Industry,
  type Stage,
  type TenureBand,
} from '../_shared/allowedValues.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type QuickFields = {
  role_category?: RoleCategory;
  industry?: Industry;
  seniority_band?: SeniorityBand;
  school?: string;
  looking_for?: string;
  can_offer?: string;
};

type ParsedFields = {
  role_category: RoleCategory;
  seniority_band: SeniorityBand;
  industry: Industry;
  stage: Stage | null;
  school: string | null;
  prior_employer: string | null;
  tenure_band: TenureBand | null;
  tenure_years_exact: number | null;
  hometown: string | null;
};

// tenure_band still drives the k-anonymity population count (section 8) — always derive it
// from the exact number when one is given, rather than trusting the model to keep two
// separately-generated fields consistent with each other.
function tenureBandFromYears(years: number): TenureBand {
  if (years < 2) return 'under 2y';
  if (years <= 5) return '2 to 5y';
  return '5y plus';
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

// Deterministic backup for when the model doesn't reliably surface this from a long, dense
// bio — a plain "N years" / "N+ years" / "eight years" pattern is regex-detectable, no model
// needed, same "ordinary code where possible" preference as the rest of this system.
function extractYearsFromText(text: string): number | null {
  const digitMatch = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/i);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  const wordMatch = text.match(/\b([a-z]+)\s*(?:years?|yrs?)\b/i);
  if (wordMatch) {
    const word = wordMatch[1].toLowerCase();
    if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  }

  return null;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildPrompt(rawText: string): string {
  return `Read the following self-description from a professional networking app user and extract structured fields. Respond with ONLY a JSON object, no prose, no markdown code fences.

Required JSON shape:
{
  "role_category": one of ${JSON.stringify(ROLE_CATEGORIES)},
  "seniority_band": one of ${JSON.stringify(SENIORITY_BANDS)},
  "industry": one of ${JSON.stringify(INDUSTRIES)},
  "stage": one of ${JSON.stringify(STAGES)} or null — the funding stage of a company THIS PERSON CURRENTLY LEADS OR FOUNDS themselves (e.g. their own startup). Do NOT use this for a company they merely worked at, invested in, or advised — a mention like "Crop One, a Series B startup" describing a past employer is NOT this person's own stage; use null in that case,
  "school": a school name as free text, or null if not mentioned,
  "prior_employer": a company this person NO LONGER works at — a PAST employer only. Look for explicit signals like "prior to", "before that", "formerly", "previously", "ex-". Their CURRENT/PRESENT employer (what they describe themselves as doing NOW) must NEVER go in this field — if the text describes their current role, that company is not the prior_employer even if it's the only company mentioned. Use null if no past employer is stated,
  "tenure_band": one of ${JSON.stringify(TENURE_BANDS)} or null if not inferable,
  "tenure_years_exact": a whole number of years of experience, ONLY if the text states a specific number (e.g. "eight years", "3 years") — null if only vague or unstated,
  "hometown": the city or place the person describes as home/where they're from, as free text, or null if not mentioned
}

Only use information present in the text. If a field cannot be reasonably inferred, use null (or the closest reasonable enum value for the three required fields, which may not be null).

Text:
"""
${rawText}
"""`;
}

// Only used for the anonymous card's generalized version of prior_employer (see migration
// 0036) — the person's own view keeps showing the exact company name, this is purely to
// avoid strangers seeing "ex Innosight" instead of "ex management consulting". Web search
// is worth the extra latency/cost here specifically because a confidently wrong guess from
// parametric memory alone (e.g. classifying an obscure company incorrectly) is worse than
// the cost of looking it up.
async function classifyEmployerIndustry(employerName: string): Promise<string | null> {
  try {
    const raw = (
      await askModel(
        `What industry or sector does the company "${employerName}" primarily operate in? Answer with a short, general industry/sector name only (2-4 words, e.g. "management consulting", "investment banking", "cloud software", "agtech"). If you cannot confidently identify this company, respond with exactly: UNKNOWN

Respond with ONLY the industry name or UNKNOWN. No prose, no punctuation, no markdown.`,
        { maxTokens: 200, enableWebSearch: true }
      )
    ).trim();

    if (!raw || raw.toUpperCase() === 'UNKNOWN' || raw.split(/\s+/).length > 6) {
      return null;
    }
    return raw;
  } catch {
    // Web search or model call failed — fall back to no classification, which just means
    // the anonymous card won't show a prior-employer fact at all (safe default).
    return null;
  }
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function validateModelOutput(raw: unknown): ParsedFields {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Model output was not a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  if (!isOneOf(obj.role_category, ROLE_CATEGORIES)) {
    throw new Error(`Invalid role_category: ${JSON.stringify(obj.role_category)}`);
  }
  if (!isOneOf(obj.seniority_band, SENIORITY_BANDS)) {
    throw new Error(`Invalid seniority_band: ${JSON.stringify(obj.seniority_band)}`);
  }
  if (!isOneOf(obj.industry, INDUSTRIES)) {
    throw new Error(`Invalid industry: ${JSON.stringify(obj.industry)}`);
  }
  if (obj.stage !== null && !isOneOf(obj.stage, STAGES)) {
    throw new Error(`Invalid stage: ${JSON.stringify(obj.stage)}`);
  }
  if (obj.tenure_band !== null && !isOneOf(obj.tenure_band, TENURE_BANDS)) {
    throw new Error(`Invalid tenure_band: ${JSON.stringify(obj.tenure_band)}`);
  }
  if (obj.school !== null && typeof obj.school !== 'string') {
    throw new Error('Invalid school');
  }
  if (obj.prior_employer !== null && typeof obj.prior_employer !== 'string') {
    throw new Error('Invalid prior_employer');
  }
  if (obj.hometown !== undefined && obj.hometown !== null && typeof obj.hometown !== 'string') {
    throw new Error('Invalid hometown');
  }
  if (
    obj.tenure_years_exact !== undefined &&
    obj.tenure_years_exact !== null &&
    (typeof obj.tenure_years_exact !== 'number' || !Number.isInteger(obj.tenure_years_exact) || obj.tenure_years_exact < 0)
  ) {
    throw new Error('Invalid tenure_years_exact');
  }

  const tenureYearsExact = (obj.tenure_years_exact as number) ?? null;

  return {
    role_category: obj.role_category as RoleCategory,
    seniority_band: obj.seniority_band as SeniorityBand,
    industry: obj.industry as Industry,
    stage: (obj.stage as Stage) ?? null,
    school: (obj.school as string) ?? null,
    prior_employer: (obj.prior_employer as string) ?? null,
    hometown: (obj.hometown as string) ?? null,
    tenure_years_exact: tenureYearsExact,
    tenure_band: tenureYearsExact !== null ? tenureBandFromYears(tenureYearsExact) : (obj.tenure_band as TenureBand) ?? null,
  };
}

function parseModelJson(text: string): unknown {
  // Models occasionally wrap JSON in fences despite instructions not to; strip if present.
  const stripped = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(stripped);
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

    const body = await req.json();
    const rawText: string = typeof body.rawText === 'string' ? body.rawText.trim() : '';
    const quickFields: QuickFields = body.quickFields ?? {};

    if (!rawText && !(quickFields.role_category && quickFields.seniority_band && quickFields.industry)) {
      return new Response(
        JSON.stringify({
          error:
            'Provide rawText, or all three of quickFields.role_category/seniority_band/industry.',
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const sourceHash = await sha256(JSON.stringify({ rawText, quickFields }));
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: existing } = await admin
      .from('profile_attributes')
      .select('*')
      .eq('user_id', callerId)
      .maybeSingle();

    if (existing?.user_edited) {
      return new Response(
        JSON.stringify({ skipped: 'user_edited is true; not overwriting', profile: existing }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (existing && existing.source_hash === sourceHash) {
      return new Response(
        JSON.stringify({ used_cache: true, profile: existing }),
        { status: 200, headers: corsHeaders }
      );
    }

    let parsed: ParsedFields;

    if (rawText) {
      const modelOutput = await askModel(buildPrompt(rawText), { maxTokens: 512 });
      parsed = validateModelOutput(parseModelJson(modelOutput));

      if (parsed.tenure_years_exact === null) {
        const fallbackYears = extractYearsFromText(rawText);
        if (fallbackYears !== null) {
          parsed.tenure_years_exact = fallbackYears;
          parsed.tenure_band = tenureBandFromYears(fallbackYears);
        }
      }
    } else {
      // No free text supplied — quick fields alone are sufficient per spec section 9
      // ("these guarantee you always have the structured data... even from someone who
      // skips everything else"). No model call needed.
      parsed = {
        role_category: quickFields.role_category!,
        seniority_band: quickFields.seniority_band!,
        industry: quickFields.industry!,
        stage: null,
        school: quickFields.school ?? null,
        // No rawText means nothing to re-extract from — preserve whatever was already on
        // file rather than wiping these out on a quick-tap-only save.
        prior_employer: existing?.prior_employer ?? null,
        tenure_band: null,
        tenure_years_exact: null,
        hometown: existing?.hometown ?? null,
      };
    }

    // Quick-tap fields are direct user input and take precedence over model inference
    // for the fields they cover.
    if (quickFields.role_category) parsed.role_category = quickFields.role_category;
    if (quickFields.seniority_band) parsed.seniority_band = quickFields.seniority_band;
    if (quickFields.industry) parsed.industry = quickFields.industry;
    if (quickFields.school) parsed.school = quickFields.school;

    if (quickFields.looking_for && quickFields.looking_for.length > 60) {
      return new Response(JSON.stringify({ error: 'looking_for must be 60 characters or fewer' }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (quickFields.can_offer && quickFields.can_offer.length > 60) {
      return new Response(JSON.stringify({ error: 'can_offer must be 60 characters or fewer' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    let priorEmployerIndustry: string | null = null;
    if (parsed.prior_employer) {
      // Skip the web-search call entirely if the employer name hasn't changed and we
      // already have a classification for it — same cost-control principle as everywhere
      // else in this system.
      if (existing?.prior_employer === parsed.prior_employer && existing?.prior_employer_industry) {
        priorEmployerIndustry = existing.prior_employer_industry;
      } else {
        priorEmployerIndustry = await classifyEmployerIndustry(parsed.prior_employer);
      }
    }

    const { data: saved, error: saveError } = await admin
      .from('profile_attributes')
      .upsert({
        user_id: callerId,
        role_category: parsed.role_category,
        seniority_band: parsed.seniority_band,
        industry: parsed.industry,
        stage: parsed.stage,
        school: parsed.school,
        prior_employer: parsed.prior_employer,
        prior_employer_industry: priorEmployerIndustry,
        tenure_band: parsed.tenure_band,
        tenure_years_exact: parsed.tenure_years_exact,
        hometown: parsed.hometown,
        looking_for: quickFields.looking_for ?? existing?.looking_for ?? null,
        can_offer: quickFields.can_offer ?? existing?.can_offer ?? null,
        generated_at: new Date().toISOString(),
        source_hash: sourceHash,
      })
      .select()
      .single();

    if (saveError) {
      return new Response(JSON.stringify({ error: saveError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ profile: saved }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
