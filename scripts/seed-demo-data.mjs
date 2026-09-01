#!/usr/bin/env node
// Seeds the App Store review demo account + 12 fake "nearby" profiles. Safe to re-run —
// every step checks for an existing row before writing, so nothing gets duplicated.
//
// Requires migration 0043_demo_mode.sql to already be applied (profiles.is_demo must exist).
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   DEMO_ACCOUNT_PASSWORD=... \
//   node scripts/seed-demo-data.mjs
//
// SUPABASE_URL falls back to EXPO_PUBLIC_SUPABASE_URL from .env if not set separately.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DEMO_PASSWORD) {
  console.error(
    'Missing env vars. Required: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, DEMO_ACCOUNT_PASSWORD'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_ACCOUNT_EMAIL = 'appreview@proxiland.app';

// Two of these (indices 1 and 7) are pre-wired to already have a pending reveal request sent
// TO the demo account, so the Requests tab / badge has something to show on first login.
const NPC_PERSONAS = [
  {
    email: 'demo-npc-01@proxiland.app',
    full_name: 'Ava Chen',
    headline: 'Climate founder building grid storage, 7 years in after Tesla.',
    employer: 'Voltframe Energy',
    title: 'Founder & CEO',
    undergrad_school: 'Stanford University',
    undergrad_year: '2016',
    bio: 'Building battery storage for commercial grids. Previously led a product team at Tesla Energy.',
    role: 'founder',
    seniority: 'senior',
    industry: 'climate',
    stage: 'series a',
    school: 'Stanford University',
    prior_employer: 'Tesla',
    prior_employer_industry: 'automotive',
    tenure_band: '5y plus',
    tenure_years_exact: 7,
    looking_for: 'Series A investors focused on climate infra',
    can_offer: 'Intros across the climate-tech founder network',
  },
  {
    email: 'demo-npc-02@proxiland.app',
    full_name: 'Marcus Bell',
    headline: 'Venture investor and Harvard MBA, 12 years backing early-stage founders.',
    employer: 'Bellwether Partners',
    title: 'General Partner',
    undergrad_school: 'University of Michigan',
    undergrad_year: '2007',
    grad_school: 'Harvard Business School',
    grad_year: '2012',
    grad_degree_type: 'MBA',
    bio: 'General Partner writing seed checks, ex-Sequoia. Spend most of my time with climate and fintech founders.',
    role: 'investor',
    seniority: 'executive',
    industry: 'vcpe',
    school: 'Harvard Business School',
    prior_employer: 'Sequoia Capital',
    prior_employer_industry: 'venture capital',
    tenure_band: '5y plus',
    tenure_years_exact: 12,
    looking_for: 'Founders raising seed to Series A',
    can_offer: 'Warm intros to later-stage funds',
    preseedReveal: true,
    connectionLine: "You're both focused on venture investing.",
  },
  {
    email: 'demo-npc-03@proxiland.app',
    full_name: 'Priya Nair',
    headline: 'ML infrastructure engineer at a Series B startup, 4 years in after Google.',
    employer: 'Latentworks',
    title: 'Staff Engineer',
    undergrad_school: 'MIT',
    undergrad_year: '2020',
    bio: 'Working on training infra for large models. Spent 2 years on Google Brain before this.',
    role: 'engineer',
    seniority: 'mid',
    industry: 'ai infrastructure',
    school: 'MIT',
    prior_employer: 'Google',
    prior_employer_industry: 'software',
    tenure_band: '2 to 5y',
    tenure_years_exact: 4,
    looking_for: 'Other ML infra folks to swap notes with',
    can_offer: 'Help debugging distributed training setups',
  },
  {
    email: 'demo-npc-04@proxiland.app',
    full_name: 'Daniel Osei',
    headline: 'Healthtech operator running clinical ops, 8 years after Oscar Health.',
    employer: 'Carewell Health',
    title: 'VP of Operations',
    undergrad_school: 'University of Pennsylvania',
    undergrad_year: '2013',
    grad_school: 'Wharton School',
    grad_year: '2017',
    grad_degree_type: 'MBA',
    bio: 'Run clinical operations for a virtual primary care startup. Previously scaled ops at Oscar Health.',
    role: 'operator',
    seniority: 'senior',
    industry: 'healthtech',
    school: 'Wharton School',
    prior_employer: 'Oscar Health',
    prior_employer_industry: 'healthtech',
    tenure_band: '5y plus',
    tenure_years_exact: 8,
    looking_for: 'Healthtech operators to compare notes on ops',
    can_offer: 'Playbooks for scaling clinical operations',
  },
  {
    email: 'demo-npc-05@proxiland.app',
    full_name: 'Sofia Marín',
    headline: 'Product designer shaping consumer apps, 3 years after Airbnb.',
    employer: 'Loopwell',
    title: 'Senior Product Designer',
    undergrad_school: 'Rhode Island School of Design',
    undergrad_year: '2020',
    bio: 'Design lead for a consumer social app. Cut my teeth on Airbnb\'s host experience team.',
    role: 'designer',
    seniority: 'mid',
    industry: 'consumer',
    school: 'Rhode Island School of Design',
    prior_employer: 'Airbnb',
    prior_employer_industry: 'consumer',
    tenure_band: '2 to 5y',
    tenure_years_exact: 3,
    looking_for: 'Other designers in consumer social',
    can_offer: 'Portfolio reviews for early-career designers',
  },
  {
    email: 'demo-npc-06@proxiland.app',
    full_name: 'Liam Novak',
    headline: 'Biotech researcher studying protein folding, 1 year after Genentech.',
    employer: 'Helix Bio',
    title: 'Research Scientist',
    undergrad_school: 'MIT',
    undergrad_year: '2022',
    grad_school: 'MIT',
    grad_year: '2024',
    grad_degree_type: 'PhD',
    bio: 'Research scientist working on protein structure prediction. PhD work continued from a Genentech internship.',
    role: 'researcher',
    seniority: 'early',
    industry: 'biotech',
    school: 'MIT',
    prior_employer: 'Genentech',
    prior_employer_industry: 'biotech',
    tenure_band: 'under 2y',
    tenure_years_exact: 1,
    looking_for: 'Collaborators in computational biology',
    can_offer: 'Structure prediction model access',
  },
  {
    email: 'demo-npc-07@proxiland.app',
    full_name: 'Jasmine Wu',
    headline: 'Grad student building an edtech side project at NYU.',
    employer: null,
    title: null,
    undergrad_school: 'NYU',
    undergrad_year: '2023',
    grad_school: 'NYU',
    grad_year: '2026',
    grad_degree_type: 'Masters',
    bio: 'Masters student researching adaptive learning tools, building a small edtech side project alongside classes.',
    role: 'student',
    seniority: 'early',
    industry: 'edtech',
    school: 'NYU',
    prior_employer: null,
    prior_employer_industry: null,
    tenure_band: 'under 2y',
    tenure_years_exact: 0,
    looking_for: 'Feedback on an early-stage edtech idea',
    can_offer: 'A pair of extra hands for a weekend project',
  },
  {
    email: 'demo-npc-08@proxiland.app',
    full_name: 'Thomas Reyes',
    headline: 'Strategy lead advising growth-stage companies, 9 years after McKinsey.',
    employer: 'Meridian Advisory',
    title: 'Principal',
    undergrad_school: 'Yale University',
    undergrad_year: '2011',
    bio: 'Independent strategy consultant for growth-stage companies. Spent 6 years at McKinsey before going independent.',
    role: 'strategist',
    seniority: 'senior',
    industry: 'consulting',
    school: 'Yale University',
    prior_employer: 'McKinsey & Company',
    prior_employer_industry: 'consulting',
    tenure_band: '5y plus',
    tenure_years_exact: 9,
    looking_for: 'Growth-stage founders navigating a pivot',
    can_offer: 'A free first strategy session',
    preseedReveal: true,
    connectionLine: "You're both ex-management consulting.",
  },
  {
    email: 'demo-npc-09@proxiland.app',
    full_name: 'Nora Fitzgerald',
    headline: 'Foodtech founder building a supply chain startup, 3 years after Sweetgreen.',
    employer: 'Harvest Loop',
    title: 'Founder & CEO',
    undergrad_school: 'Cornell University',
    undergrad_year: '2019',
    bio: 'Building supply chain software for regional food producers. Ran sourcing ops at Sweetgreen before this.',
    role: 'founder',
    seniority: 'mid',
    industry: 'foodtech',
    stage: 'seed',
    school: 'Cornell University',
    prior_employer: 'Sweetgreen',
    prior_employer_industry: 'food beverage',
    tenure_band: '2 to 5y',
    tenure_years_exact: 3,
    looking_for: 'Seed investors in supply chain / foodtech',
    can_offer: 'Intros to regional food producers',
  },
  {
    email: 'demo-npc-10@proxiland.app',
    full_name: 'Ethan Brooks',
    headline: 'Fintech investor and Columbia grad, 11 years after Goldman Sachs.',
    employer: 'Northbridge Capital',
    title: 'Managing Director',
    undergrad_school: 'Columbia University',
    undergrad_year: '2008',
    bio: 'Lead fintech investments at a growth-stage fund. Started in Goldman\'s trading division.',
    role: 'investor',
    seniority: 'executive',
    industry: 'fintech',
    school: 'Columbia University',
    prior_employer: 'Goldman Sachs',
    prior_employer_industry: 'banking',
    tenure_band: '5y plus',
    tenure_years_exact: 11,
    looking_for: 'Series B fintech founders',
    can_offer: 'Intros to banking partners',
  },
  {
    email: 'demo-npc-11@proxiland.app',
    full_name: 'Zoe Kaplan',
    headline: 'Security engineer hardening infrastructure, 5 years after Palantir.',
    employer: 'Fortline Security',
    title: 'Senior Security Engineer',
    undergrad_school: 'UC Berkeley',
    undergrad_year: '2018',
    bio: 'Lead security engineering for a B2B infrastructure company. Started my career at Palantir.',
    role: 'engineer',
    seniority: 'mid',
    industry: 'cybersecurity',
    school: 'UC Berkeley',
    prior_employer: 'Palantir',
    prior_employer_industry: 'software',
    tenure_band: '2 to 5y',
    tenure_years_exact: 5,
    looking_for: 'Other security engineers in early-stage startups',
    can_offer: 'A security review for early-stage products',
  },
  {
    email: 'demo-npc-12@proxiland.app',
    full_name: 'Omar Haddad',
    headline: 'Real estate operator scaling flexible workspace, 6 years after WeWork.',
    employer: 'Groundfloor Spaces',
    title: 'VP of Growth',
    undergrad_school: 'University of Southern California',
    undergrad_year: '2015',
    bio: 'Run growth for a flexible workspace operator. Spent 4 years on WeWork\'s expansion team.',
    role: 'operator',
    seniority: 'senior',
    industry: 'real estate',
    school: 'University of Southern California',
    prior_employer: 'WeWork',
    prior_employer_industry: 'real estate',
    tenure_band: '5y plus',
    tenure_years_exact: 6,
    looking_for: 'Landlords open to flexible lease structures',
    can_offer: 'Market data on flexible workspace demand',
  },
];

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

async function ensureAuthUser(email, password, fullName) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user;
}

async function uploadAvatar(userId, seed) {
  const url = `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear&size=256`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Avatar fetch failed for ${seed}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `${userId}/profile.png`;
  const { error } = await admin.storage.from('avatars').upload(path, buf, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

async function ensureIncomingRevealRequest(requesterId, targetId, connectionLine) {
  const { data: existing, error: selErr } = await admin
    .from('reveal_requests')
    .select('id')
    .eq('requester_id', requesterId)
    .eq('target_id', targetId)
    .eq('state', 'pending')
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return;

  const { error } = await admin.from('reveal_requests').insert({
    requester_id: requesterId,
    target_id: targetId,
    connection_line: connectionLine,
    state: 'pending',
  });
  if (error) throw error;
}

async function main() {
  console.log(`Seeding demo account: ${DEMO_ACCOUNT_EMAIL}`);
  const demoUser = await ensureAuthUser(DEMO_ACCOUNT_EMAIL, DEMO_PASSWORD, 'App Reviewer');

  const { error: demoProfileErr } = await admin
    .from('profiles')
    .update({
      is_demo: true,
      full_name: 'App Reviewer',
      headline: 'Operator exploring new tools, based wherever the review happens to be.',
      bio: 'Reviewing networking apps and exploring how professionals meet nearby.',
    })
    .eq('id', demoUser.id);
  if (demoProfileErr) throw demoProfileErr;

  // The demo account needs its own profile_attributes row too — without one, phrase-overlap
  // ("why you two") always comes back empty, since it requires both people to have structured
  // fields to compare, not just the 12 NPCs.
  const { error: demoAttrErr } = await admin.from('profile_attributes').upsert(
    {
      user_id: demoUser.id,
      role_category: 'operator',
      seniority_band: 'mid',
      industry: 'enterprise',
      school: 'Stanford University',
      looking_for: 'Exploring how people use this app',
      can_offer: 'Feedback on the product',
      user_edited: true,
      source_hash: 'demo-seed',
    },
    { onConflict: 'user_id' }
  );
  if (demoAttrErr) throw demoAttrErr;
  console.log(`  -> ${demoUser.id}`);

  const npcIdsByEmail = {};

  for (const persona of NPC_PERSONAS) {
    console.log(`Seeding NPC: ${persona.full_name}`);
    const user = await ensureAuthUser(persona.email, DEMO_PASSWORD, persona.full_name);
    npcIdsByEmail[persona.email] = user.id;

    const photoUrl = await uploadAvatar(user.id, persona.full_name);

    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        is_demo: true,
        full_name: persona.full_name,
        headline: persona.headline,
        employer: persona.employer,
        title: persona.title,
        undergrad_school: persona.undergrad_school ?? null,
        undergrad_year: persona.undergrad_year ?? null,
        grad_school: persona.grad_school ?? null,
        grad_year: persona.grad_year ?? null,
        grad_degree_type: persona.grad_degree_type ?? null,
        bio: persona.bio,
        photo_url: photoUrl,
      })
      .eq('id', user.id);
    if (profileErr) throw profileErr;

    const { error: attrErr } = await admin.from('profile_attributes').upsert(
      {
        user_id: user.id,
        role_category: persona.role,
        seniority_band: persona.seniority,
        industry: persona.industry,
        stage: persona.stage ?? null,
        school: persona.school,
        prior_employer: persona.prior_employer,
        prior_employer_industry: persona.prior_employer_industry,
        tenure_band: persona.tenure_band,
        tenure_years_exact: persona.tenure_years_exact,
        looking_for: persona.looking_for,
        can_offer: persona.can_offer,
        user_edited: true,
        source_hash: 'demo-seed',
      },
      { onConflict: 'user_id' }
    );
    if (attrErr) throw attrErr;
  }

  console.log('Seeding pre-pending incoming reveal requests to the demo account...');
  for (const persona of NPC_PERSONAS) {
    if (!persona.preseedReveal) continue;
    const npcId = npcIdsByEmail[persona.email];
    await ensureIncomingRevealRequest(npcId, demoUser.id, persona.connectionLine);
    console.log(`  -> pending reveal from ${persona.full_name}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
