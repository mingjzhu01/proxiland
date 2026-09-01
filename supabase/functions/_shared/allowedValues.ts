// Controlled vocabularies for profile_attributes. role_category and seniority_band are
// Postgres enums (see migration 0014); industry, stage, and tenure_band are `text` columns
// with a check constraint in the DB as a second line of defense, but must also be validated
// here before insert — reject rather than coerce, per spec v4 section 13 (parse-profile).
//
// Kept in sync with lib/allowedValues.ts (the RN app's copy) — Metro and Deno don't share a
// module graph, so this is duplicated rather than imported.

export const ROLE_CATEGORIES = [
  'founder', 'investor', 'operator', 'engineer', 'designer', 'researcher', 'student', 'strategist',
] as const;

export const SENIORITY_BANDS = ['early', 'mid', 'senior', 'executive'] as const;

export const INDUSTRIES = [
  'fintech', 'finance', 'investments', 'vcpe', 'venture capital', 'private equity',
  'public equity', 'banking', 'insurance', 'insurtech', 'accounting',
  'consulting', 'legal tech', 'law', 'foodtech', 'food beverage', 'agriculture', 'climate',
  'energy', 'renewable energy', 'oil gas', 'mining', 'utilities', 'water', 'waste management',
  'healthtech', 'pharma', 'biotech', 'medical devices', 'healthcare services',
  'wellness fitness', 'logistics', 'transportation', 'shipping', 'aviation', 'automotive',
  'aerospace defense', 'space', 'manufacturing', 'semiconductors', 'hardware', 'robotics',
  'iot', 'consumer', 'retail', 'e-commerce', 'luxury goods', 'beauty cosmetics', 'fashion',
  'enterprise', 'software', 'cloud computing', 'data analytics', 'ai infrastructure',
  'cybersecurity', 'web3', 'gaming', 'esports', 'media', 'entertainment', 'music', 'film',
  'publishing', 'journalism', 'advertising', 'marketing tech', 'public relations',
  'market research', 'edtech', 'education', 'childcare', 'proptech', 'real estate',
  'construction', 'architecture', 'interior design', 'travel', 'hospitality', 'hr tech',
  'staffing recruiting', 'government', 'nonprofit', 'social impact', 'mobility',
  'telecommunications', 'security services', 'environmental services', 'veterinary pet care',
  'senior care', 'sports',
] as const;

export const STAGES = ['pre seed', 'seed', 'series a', 'series b plus', 'public'] as const;

export const TENURE_BANDS = ['under 2y', '2 to 5y', '5y plus'] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export type SeniorityBand = (typeof SENIORITY_BANDS)[number];
export type Industry = (typeof INDUSTRIES)[number];
export type Stage = (typeof STAGES)[number];
export type TenureBand = (typeof TENURE_BANDS)[number];
