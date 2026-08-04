import { supabase } from '../supabase';

export async function verifyLinkedInCode(code: string): Promise<{ name: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('linkedin-verify', { body: { code } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
