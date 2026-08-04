// Controlled vocabularies for profile_attributes. role_category and seniority_band are
// Postgres enums (see migration 0014); industry, stage, and tenure_band are `text` columns
// with a check constraint in the DB as a second line of defense, but must also be validated
// here before insert — reject rather than coerce, per spec v4 section 13 (parse-profile).
//
// Assumption carried forward from the v2 spec's field taxonomy, since v4 doesn't restate
// these lists. Flagged to the user; adjust here (and the matching DB check constraint) if
// the real list should differ.

export const ROLE_CATEGORIES = [
  'founder', 'investor', 'operator', 'engineer', 'designer', 'researcher', 'student',
] as const;

export const SENIORITY_BANDS = ['early', 'mid', 'senior', 'executive'] as const;

export const INDUSTRIES = [
  'fintech', 'foodtech', 'climate', 'healthtech', 'logistics', 'consumer', 'enterprise',
] as const;

export const STAGES = ['pre seed', 'seed', 'series a', 'series b plus', 'public'] as const;

export const TENURE_BANDS = ['under 2y', '2 to 5y', '5y plus'] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export type SeniorityBand = (typeof SENIORITY_BANDS)[number];
export type Industry = (typeof INDUSTRIES)[number];
export type Stage = (typeof STAGES)[number];
export type TenureBand = (typeof TENURE_BANDS)[number];
