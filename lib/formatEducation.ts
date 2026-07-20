import type { Profile, NearbyUser } from './types';

function yearSuffix(year: string | null | undefined): string {
  const trimmed = year?.trim();
  if (!trimmed) return '';
  return `'${trimmed.slice(-2)}`;
}

export function formatEducation(
  profile: Pick<
    Profile | NearbyUser,
    'grad_school' | 'grad_year' | 'undergrad_school' | 'undergrad_year'
  >
): string {
  const parts: string[] = [];

  const gradSchool = profile.grad_school?.trim();
  if (gradSchool) parts.push(`${gradSchool}${yearSuffix(profile.grad_year)}`);

  const undergradSchool = profile.undergrad_school?.trim();
  if (undergradSchool) parts.push(`${undergradSchool}${yearSuffix(profile.undergrad_year)}`);

  return parts.join(', ');
}
