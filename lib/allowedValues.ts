// Mirrors supabase/functions/_shared/allowedValues.ts. Duplicated rather than imported
// across the Metro (RN) / Deno (edge functions) boundary — the two runtimes don't share a
// module graph. Keep both lists in sync if the taxonomy changes.

export const ROLE_CATEGORIES = [
  'founder', 'investor', 'operator', 'engineer', 'designer', 'researcher', 'student',
] as const;

export const SENIORITY_BANDS = ['early', 'mid', 'senior', 'executive'] as const;

export const INDUSTRIES = [
  'fintech', 'foodtech', 'climate', 'healthtech', 'logistics', 'consumer', 'enterprise',
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export type SeniorityBand = (typeof SENIORITY_BANDS)[number];
export type Industry = (typeof INDUSTRIES)[number];

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  founder: 'Founder',
  investor: 'Investor',
  operator: 'Operator',
  engineer: 'Engineer',
  designer: 'Designer',
  researcher: 'Researcher',
  student: 'Student',
};

export const SENIORITY_BAND_LABELS: Record<SeniorityBand, string> = {
  early: 'Early career',
  mid: 'Mid level',
  senior: 'Senior',
  executive: 'Executive',
};

export const INDUSTRY_LABELS: Record<Industry, string> = {
  fintech: 'Fintech',
  foodtech: 'Foodtech',
  climate: 'Climate',
  healthtech: 'Healthtech',
  logistics: 'Logistics',
  consumer: 'Consumer',
  enterprise: 'Enterprise',
};
