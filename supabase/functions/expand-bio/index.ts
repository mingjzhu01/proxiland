// Backs the "Expand" interaction on a feed card: a longer, model-written paragraph built
// ONLY from the same facts individual_cards_for_scope already decided are safe to show for
// this specific (person, scope) pair — i.e. whatever survived that scope's k-anonymity
// suppression — plus looking_for/can_offer (never part of the suppression drop sequence).
// Never reads the person's raw, unsuppressed profile. The suppressed line is recomputed
// here server-side rather than trusted from the client, so one viewer can't poison the
// shared per-scope cache with a fabricated version of someone else's card.

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

const ALLOWED_CONNECTORS = new Set([
  'a', 'an', 'the', 'at', 'in', 'on', 'of', 'and', 'with', 'for', 'from', 'to', 'is', 'was',
  'were', 'now', 'currently', 'previously', 'formerly', 'ex', 'grad', 'graduate', 'years',
  'year', 'experience', 'plus', 'also', 'looking', 'can', 'offer', 'that', 'this', 'be',
  'building', 'working', 'on', 'as', 'we', 'i', 'my', 'our', 'you', 'they', 'it', 'someone',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}

function verifyNoInventedFacts(bio: string, approvedText: string[]): boolean {
  const approvedWords = new Set(approvedText.flatMap((t) => tokenize(t)));
  return tokenize(bio).every((w) => approvedWords.has(w) || ALLOWED_CONNECTORS.has(w));
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildPrompt(line: string, lookingFor: string | null, canOffer: string | null): string {
  return `Write a short paragraph (2 to 3 sentences, 40 words or fewer) expanding on the following short professional summary for a networking app. You may ONLY use facts already present below — do not add, infer, or embellish anything new.

Summary: "${line}"
${lookingFor ? `Looking for: "${lookingFor}"` : ''}
${canOffer ? `Can offer: "${canOffer}"` : ''}

Respond with ONLY the paragraph. No quotes, no prefix, no markdown.`;
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

    const { target_user_id: targetUserId, scope_id: scopeId } = await req.json();
    if (typeof targetUserId !== 'string' || typeof scopeId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing target_user_id or scope_id' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Recomputes the suppressed line under the CALLER's own auth context — this both
    // verifies scope membership (the function raises if not a member) and returns exactly
    // what this caller is actually allowed to see for this target, same source of truth as
    // the feed itself.
    const { data: cards, error: cardsError } = await callerClient.rpc('individual_cards_for_scope', {
      p_scope_id: scopeId,
    });
    if (cardsError) {
      return new Response(JSON.stringify({ error: cardsError.message }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const card = (cards ?? []).find((c: { user_id: string }) => c.user_id === targetUserId);
    if (!card) {
      return new Response(JSON.stringify({ error: 'That person is not in this scope for you' }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: attrs } = await admin
      .from('profile_attributes')
      .select('looking_for, can_offer')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const lookingFor: string | null = attrs?.looking_for ?? null;
    const canOffer: string | null = attrs?.can_offer ?? null;
    const line: string = card.line;

    const fingerprint = await sha256(JSON.stringify({ line, lookingFor, canOffer }));

    const { data: cached } = await admin
      .from('card_bio_cache')
      .select('bio, source_fingerprint')
      .eq('user_id', targetUserId)
      .eq('scope_id', scopeId)
      .maybeSingle();

    if (cached && cached.source_fingerprint === fingerprint) {
      return new Response(JSON.stringify({ bio: cached.bio }), { status: 200, headers: corsHeaders });
    }

    let bio = line;
    try {
      const raw = (await askModel(buildPrompt(line, lookingFor, canOffer), { maxTokens: 120 })).trim();
      const approvedText = [line, lookingFor, canOffer].filter((t): t is string => !!t);
      if (raw && verifyNoInventedFacts(raw, approvedText)) {
        bio = raw;
      }
      // Otherwise: silently fall back to the plain line, same rule as polish-line.
    } catch {
      // Model call failed — same silent fallback.
    }

    const { error: cacheError } = await admin
      .from('card_bio_cache')
      .upsert({ user_id: targetUserId, scope_id: scopeId, source_fingerprint: fingerprint, bio });

    if (cacheError) {
      return new Response(JSON.stringify({ error: cacheError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ bio }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
