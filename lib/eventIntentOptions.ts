// Canonical event-intent taxonomy (ask/offer options a participant picks from). This is the
// single source of truth for every client screen that renders these options or their labels —
// don't duplicate the option strings elsewhere in the app.
//
// A server-side copy of the same ids/labels/compatibility map lives in
// supabase/functions/_shared/eventIntentTaxonomy.ts, because Deno edge functions can't reach
// into this app's lib/ folder at deploy time (different runtime, different deploy boundary).
// Keep the two in sync by hand when this file changes.
//
// One global typed taxonomy for this MVP, not an organizer-facing editor — see
// IntentOption's shape below, which is deliberately generic enough to move to
// server/event-specific configuration later without touching the form, matching logic, or AI
// prompt construction that consume it.

export type IntentOptionType = 'ask' | 'offer';

export type IntentOption = {
  id: string;
  type: IntentOptionType;
  group: string;
  label: string;
  compatibleOptionIds: string[];
  active: boolean;
  sortOrder: number;
  requiresDetail?: boolean;
};

function buildOptions(
  type: IntentOptionType,
  groups: { group: string; options: { id: string; label: string; compatibleOptionIds?: string[]; requiresDetail?: boolean }[] }[]
): IntentOption[] {
  let sortOrder = 0;
  const out: IntentOption[] = [];
  for (const { group, options } of groups) {
    for (const o of options) {
      out.push({
        id: o.id,
        type,
        group,
        label: o.label,
        compatibleOptionIds: o.compatibleOptionIds ?? [],
        active: true,
        sortOrder: sortOrder++,
        requiresDetail: o.requiresDetail,
      });
    }
  }
  return out;
}

export const ASK_OPTIONS: IntentOption[] = buildOptions('ask', [
  {
    group: 'Learn and advise',
    options: [
      { id: 'ask_advice_feedback', label: 'Advice or feedback' },
      { id: 'ask_knowledge_expertise', label: 'Knowledge or expertise' },
      { id: 'ask_mentorship_peers', label: 'Mentorship or peer support' },
    ],
  },
  {
    group: 'Build and collaborate',
    options: [
      { id: 'ask_collaborators', label: 'Collaborators or project partners' },
      { id: 'ask_cofounder', label: 'A co-founder or founding team' },
      { id: 'ask_solutions', label: 'Products, services or solutions' },
    ],
  },
  {
    group: 'Customers and partnerships',
    options: [
      { id: 'ask_customers', label: 'Customers, buyers or users' },
      { id: 'ask_partners', label: 'Business or distribution partners' },
    ],
  },
  {
    group: 'Talent and careers',
    options: [
      { id: 'ask_talent', label: 'Talent or team members' },
      { id: 'ask_career', label: 'A job or career opportunity' },
    ],
  },
  {
    group: 'Capital and startups',
    options: [
      { id: 'ask_funding', label: 'Funding or investors' },
      { id: 'ask_startups', label: 'Startups or investment opportunities' },
    ],
  },
  {
    group: 'Network and visibility',
    options: [
      { id: 'ask_introductions', label: 'Introductions or network access' },
      { id: 'ask_visibility', label: 'Speaking, media or visibility opportunities' },
      { id: 'ask_open', label: 'Open to relevant new connections' },
    ],
  },
  {
    group: 'Custom',
    options: [{ id: 'ask_other', label: 'Other — write my own', requiresDetail: true }],
  },
]);

export const OFFER_OPTIONS: IntentOption[] = buildOptions('offer', [
  {
    group: 'Learn and advise',
    options: [
      { id: 'offer_advice_feedback', label: 'Advice or feedback' },
      { id: 'offer_expertise', label: 'Professional or technical expertise' },
      { id: 'offer_mentorship_peers', label: 'Mentorship or peer support' },
    ],
  },
  {
    group: 'Build and collaborate',
    options: [
      { id: 'offer_collaboration', label: 'A collaboration or project opportunity' },
      { id: 'offer_cofounder', label: 'Open to a co-founder or founding-team opportunity' },
      { id: 'offer_solution', label: 'A product, service or solution' },
    ],
  },
  {
    group: 'Customers and partnerships',
    options: [
      { id: 'offer_customer_access', label: 'Customer, buyer or user access or perspective' },
      { id: 'offer_partnership_access', label: 'Partnership or distribution access' },
    ],
  },
  {
    group: 'Talent and careers',
    options: [
      { id: 'offer_jobs_hiring', label: 'Jobs, hiring or career introductions' },
      { id: 'offer_candidate_skills', label: 'My skills or interest in joining a team' },
    ],
  },
  {
    group: 'Capital and startups',
    options: [
      { id: 'offer_capital', label: 'Capital or investor access' },
      { id: 'offer_startup_opportunity', label: 'A startup, deal or investment opportunity' },
    ],
  },
  {
    group: 'Network and visibility',
    options: [
      { id: 'offer_introductions', label: 'Introductions or network access' },
      { id: 'offer_visibility', label: 'Audience, media or speaking opportunities' },
      { id: 'offer_open', label: 'Open to useful conversations' },
    ],
  },
  {
    group: 'Custom',
    options: [{ id: 'offer_other', label: 'Other — write my own', requiresDetail: true }],
  },
]);

// Deterministic ask -> compatible-offer relationships (spec section 8), attached onto the ask
// options themselves so there's one place to read them from.
const COMPATIBLE_OFFERS: Record<string, string[]> = {
  ask_advice_feedback: ['offer_advice_feedback', 'offer_expertise', 'offer_mentorship_peers'],
  ask_knowledge_expertise: ['offer_expertise', 'offer_advice_feedback'],
  ask_mentorship_peers: ['offer_mentorship_peers', 'offer_expertise'],
  ask_collaborators: ['offer_collaboration'],
  ask_cofounder: ['offer_cofounder'],
  ask_solutions: ['offer_solution'],
  ask_customers: ['offer_customer_access'],
  ask_partners: ['offer_partnership_access', 'offer_collaboration'],
  ask_talent: ['offer_candidate_skills'],
  ask_career: ['offer_jobs_hiring'],
  ask_funding: ['offer_capital'],
  ask_startups: ['offer_startup_opportunity'],
  ask_introductions: ['offer_introductions'],
  ask_visibility: ['offer_visibility'],
  ask_open: ['offer_open'],
};
for (const option of ASK_OPTIONS) {
  option.compatibleOptionIds = COMPATIBLE_OFFERS[option.id] ?? [];
}

export const ASK_OPTION_BY_ID: Record<string, IntentOption> = Object.fromEntries(
  ASK_OPTIONS.map((o) => [o.id, o])
);
export const OFFER_OPTION_BY_ID: Record<string, IntentOption> = Object.fromEntries(
  OFFER_OPTIONS.map((o) => [o.id, o])
);

export function labelsFor(type: IntentOptionType, ids: string[]): string[] {
  const byId = type === 'ask' ? ASK_OPTION_BY_ID : OFFER_OPTION_BY_ID;
  return ids.map((id) => byId[id]?.label).filter((l): l is string => !!l);
}

// Grouped shape ready for rendering (preserves each group's option order).
export function groupedOptions(type: IntentOptionType): { group: string; options: IntentOption[] }[] {
  const options = type === 'ask' ? ASK_OPTIONS : OFFER_OPTIONS;
  const groups: { group: string; options: IntentOption[] }[] = [];
  for (const option of options) {
    let bucket = groups.find((g) => g.group === option.group);
    if (!bucket) {
      bucket = { group: option.group, options: [] };
      groups.push(bucket);
    }
    bucket.options.push(option);
  }
  return groups;
}
