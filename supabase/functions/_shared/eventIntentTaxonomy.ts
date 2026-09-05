// Server-side copy of lib/eventIntentOptions.ts's ids, labels, and compatibility map. Deno
// edge functions can't import from this app's lib/ folder at deploy time (Supabase only
// bundles a function's own directory plus _shared/), so the id->label maps and the
// deterministic ask->offer compatibility relationships are duplicated here by hand.
// KEEP IN SYNC with lib/eventIntentOptions.ts whenever the taxonomy changes.

export const ASK_LABELS: Record<string, string> = {
  ask_advice_feedback: 'Advice or feedback',
  ask_knowledge_expertise: 'Knowledge or expertise',
  ask_mentorship_peers: 'Mentorship or peer support',
  ask_collaborators: 'Collaborators or project partners',
  ask_cofounder: 'A co-founder or founding team',
  ask_solutions: 'Products, services or solutions',
  ask_customers: 'Customers, buyers or users',
  ask_partners: 'Business or distribution partners',
  ask_talent: 'Talent or team members',
  ask_career: 'A job or career opportunity',
  ask_funding: 'Funding or investors',
  ask_startups: 'Startups or investment opportunities',
  ask_introductions: 'Introductions or network access',
  ask_visibility: 'Speaking, media or visibility opportunities',
  ask_open: 'Open to relevant new connections',
  ask_other: 'Other',
};

export const OFFER_LABELS: Record<string, string> = {
  offer_advice_feedback: 'Advice or feedback',
  offer_expertise: 'Professional or technical expertise',
  offer_mentorship_peers: 'Mentorship or peer support',
  offer_collaboration: 'A collaboration or project opportunity',
  offer_cofounder: 'Open to a co-founder or founding-team opportunity',
  offer_solution: 'A product, service or solution',
  offer_customer_access: 'Customer, buyer or user access or perspective',
  offer_partnership_access: 'Partnership or distribution access',
  offer_jobs_hiring: 'Jobs, hiring or career introductions',
  offer_candidate_skills: 'My skills or interest in joining a team',
  offer_capital: 'Capital or investor access',
  offer_startup_opportunity: 'A startup, deal or investment opportunity',
  offer_introductions: 'Introductions or network access',
  offer_visibility: 'Audience, media or speaking opportunities',
  offer_open: 'Open to useful conversations',
  offer_other: 'Other',
};

export const COMPATIBLE_OFFERS: Record<string, string[]> = {
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

export function labelsForAsk(ids: string[] | null | undefined): string[] {
  return (ids ?? []).map((id) => ASK_LABELS[id]).filter((l): l is string => !!l);
}

export function labelsForOffer(ids: string[] | null | undefined): string[] {
  return (ids ?? []).map((id) => OFFER_LABELS[id]).filter((l): l is string => !!l);
}

// Fraction of askIds that have at least one compatible id present in offerIds — the
// deterministic ask/offer complement score, per spec section 8.
export function intentComplement(askIds: string[] | null | undefined, offerIds: string[] | null | undefined): number {
  const asks = askIds ?? [];
  const offers = offerIds ?? [];
  if (asks.length === 0) return 0;
  const satisfied = asks.filter((askId) => (COMPATIBLE_OFFERS[askId] ?? []).some((id) => offers.includes(id)));
  return satisfied.length / asks.length;
}
