#!/usr/bin/env node
// Testing tool: sets up one fully-populated test event using the same 12 demo NPCs from
// seed-demo-data.mjs (run that script first if you haven't) — each NPC is added as an active
// member with hand-picked structured ask/offer selections (NPC_INTENTS below), so matching
// can be exercised immediately without hand-entering 12 people's intents through the app.
//
// Your OWN real account is deliberately NOT added here — join the printed QR link yourself
// (Scan QR on the Nearby tab, or open the deep link directly on your test device) so the
// actual join flow gets exercised too, not just admin-inserted rows.
//
// Safe to re-run — reuses the same event (matched by name) and upserts NPC membership/intent
// each time rather than duplicating anything.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/seed-demo-event.mjs

import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Required: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EVENT_NAME = 'Demo Test Event';
const NPC_EMAILS = Array.from({ length: 12 }, (_, i) => `demo-npc-${String(i + 1).padStart(2, '0')}@proxiland.app`);

// Structured ask/offer tags (ids from lib/eventIntentOptions.ts / _shared/eventIntentTaxonomy.ts)
// per NPC, chosen deliberately (not just copied from their old free-text looking_for/can_offer)
// to demonstrate real variety once matched against each other or against whatever the logged-in
// test account picks: Priya <-> Liam is a genuine two-directional reciprocal match
// (ask_collaborators <-> offer_collaboration both ways); Ava/Nora -> Marcus/Ethan are strong
// one-directional matches (founders asking for funding, investors offering capital, but the
// investors' own asks aren't satisfied back); Jasmine and Omar are deliberately low-relevance
// for most other attendees' asks. Detail text is realistic but clearly fictional.
const NPC_INTENTS = {
  'demo-npc-01@proxiland.app': {
    // Ava Chen
    ask: ['ask_funding', 'ask_introductions'],
    askDetail: 'Raising our Series A for grid-scale storage.',
    offer: ['offer_collaboration', 'offer_introductions'],
    offerDetail: 'Happy to intro other climate-tech founders to each other.',
  },
  'demo-npc-02@proxiland.app': {
    // Marcus Bell
    ask: ['ask_startups'],
    askDetail: 'Looking for seed-to-Series-A climate and fintech deals.',
    offer: ['offer_capital', 'offer_introductions'],
    offerDetail: null,
  },
  'demo-npc-03@proxiland.app': {
    // Priya Nair
    ask: ['ask_collaborators', 'ask_mentorship_peers'],
    askDetail: null,
    offer: ['offer_collaboration', 'offer_expertise'],
    offerDetail: 'Happy to pair on distributed training problems.',
  },
  'demo-npc-04@proxiland.app': {
    // Daniel Osei
    ask: ['ask_advice_feedback'],
    askDetail: 'Trying to figure out our clinical-ops scaling plan.',
    offer: ['offer_advice_feedback', 'offer_mentorship_peers'],
    offerDetail: null,
  },
  'demo-npc-05@proxiland.app': {
    // Sofia Marín
    ask: ['ask_mentorship_peers'],
    askDetail: null,
    offer: ['offer_mentorship_peers', 'offer_solution'],
    offerDetail: 'Can review portfolios for early-career designers.',
  },
  'demo-npc-06@proxiland.app': {
    // Liam Novak
    ask: ['ask_collaborators'],
    askDetail: 'Looking for people to pressure-test a protein-folding side project.',
    offer: ['offer_collaboration'],
    offerDetail: null,
  },
  'demo-npc-07@proxiland.app': {
    // Jasmine Wu
    ask: ['ask_advice_feedback', 'ask_collaborators'],
    askDetail: 'First-time builder, would love a sanity check on my edtech idea.',
    offer: ['offer_candidate_skills'],
    offerDetail: null,
  },
  'demo-npc-08@proxiland.app': {
    // Thomas Reyes
    ask: ['ask_customers'],
    askDetail: null,
    offer: ['offer_advice_feedback', 'offer_expertise'],
    offerDetail: 'Free first strategy session for anyone navigating a pivot.',
  },
  'demo-npc-09@proxiland.app': {
    // Nora Fitzgerald
    ask: ['ask_funding'],
    askDetail: 'Raising a seed round for food supply-chain software.',
    offer: ['offer_collaboration'],
    offerDetail: null,
  },
  'demo-npc-10@proxiland.app': {
    // Ethan Brooks
    ask: ['ask_startups'],
    askDetail: 'Looking for Series B fintech opportunities.',
    offer: ['offer_capital'],
    offerDetail: null,
  },
  'demo-npc-11@proxiland.app': {
    // Zoe Kaplan
    ask: ['ask_open'],
    askDetail: null,
    offer: ['offer_open', 'offer_expertise'],
    offerDetail: 'Can do a quick security review for early-stage products.',
  },
  'demo-npc-12@proxiland.app': {
    // Omar Haddad
    ask: ['ask_partners'],
    askDetail: 'Looking for landlords open to flexible lease terms.',
    offer: ['offer_partnership_access'],
    offerDetail: null,
  },
};

async function findUserByEmail(email) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function main() {
  console.log('Looking up demo NPCs (run scripts/seed-demo-data.mjs first if any are missing)...');
  const npcs = [];
  for (const email of NPC_EMAILS) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.error(`Missing demo NPC ${email} — run scripts/seed-demo-data.mjs first.`);
      process.exit(1);
    }
    npcs.push({ email, id: user.id });
  }
  console.log(`Found ${npcs.length} demo NPCs.`);

  let { data: event, error: findError } = await admin
    .from('scopes')
    .select('id, qr_join_token_hash')
    .eq('kind', 'venue')
    .eq('name', EVENT_NAME)
    .maybeSingle();
  if (findError) throw findError;

  let rawToken = null;
  if (!event) {
    rawToken = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const { data: created, error: createError } = await admin
      .from('scopes')
      .insert({
        kind: 'venue',
        name: EVENT_NAME,
        organizer_name: 'Proxiland (test)',
        description: 'Internal test event for exercising the matching pipeline end to end.',
        identity_mode: 'full_required',
        join_mode: 'qr_only',
        matching_mode: 'hybrid_ai',
        overlap_display_mode: 'lower_ranked',
        qr_join_token_hash: tokenHash,
        status: 'active',
      })
      .select('id')
      .single();
    if (createError) throw createError;
    event = created;
    console.log('Created new test event.');
  } else {
    console.log('Reusing existing test event.');
  }

  console.log('Adding NPCs as active members with structured ask/offer intent...');
  const now = new Date().toISOString();
  for (const npc of npcs) {
    const intent = NPC_INTENTS[npc.email];
    if (!intent) throw new Error(`No NPC_INTENTS entry for ${npc.email} — add one before seeding.`);

    const { error: memberError } = await admin
      .from('scope_members')
      .upsert(
        { scope_id: event.id, user_id: npc.id, join_method: 'admin_test', status: 'active', joined_at: now },
        { onConflict: 'scope_id,user_id' }
      );
    if (memberError) throw memberError;

    // Written directly (not via the upsert_event_intent RPC) since this is a service-role
    // seed script, not an authenticated end-user action — completed_at is set explicitly
    // because fake accounts only count as eligible candidates once seeded as complete
    // (spec: "Fake demo accounts should be treated as completed only after they have seeded
    // ask and offer data").
    const { error: intentError } = await admin.from('event_intents').upsert(
      {
        scope_id: event.id,
        user_id: npc.id,
        ask_tags: intent.ask,
        ask_text: intent.askDetail,
        offer_tags: intent.offer,
        offer_text: intent.offerDetail,
        active: true,
        completed_at: now,
        updated_at: now,
      },
      { onConflict: 'scope_id,user_id' }
    );
    if (intentError) throw intentError;
  }

  console.log('\nDone.');
  console.log('  event id:', event.id);
  if (rawToken) {
    console.log('  join link:', `proxiland://event-join/${rawToken}`);
    console.log('  (open that link on your test device, or use Scan QR in the app with a QR code encoding it)');
  } else {
    console.log('  (event already existed — its original join link was only shown once when first created)');
  }
  console.log('\nAfter joining and setting your own intent, check results with:');
  console.log(`  select event_report('${event.id}');`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
