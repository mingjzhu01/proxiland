import { supabase } from '../supabase';

export type DraftBioFields = {
  name: string;
  school?: string;
  gradYear?: string;
  advancedDegree?: string;
  employer?: string;
  title?: string;
  role?: string;
  industry?: string;
  seniority?: string;
};

export type DraftBioResult =
  | {
      status: 'found';
      matched_identity: string;
      bio: string;
      sources: string[];
      title: string | null;
      employer: string | null;
      undergrad_school: string | null;
      advanced_degree_school: string | null;
      advanced_degree_type: string | null;
      linkedin_url: string | null;
    }
  | { status: 'fallback'; bio: string }
  | { status: 'error' };

export async function draftBio(fields: DraftBioFields, skipSearch = false): Promise<DraftBioResult> {
  const { data, error } = await supabase.functions.invoke('draft-bio', {
    body: { ...fields, skipSearch },
  });
  if (error) throw error;
  return data as DraftBioResult;
}
