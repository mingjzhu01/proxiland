import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Where Supabase sends the browser after a sign-up confirmation link is opened. Without this
// the link still confirms the address server-side but then lands on the project's default
// Site URL — a blank page — which reads as "nothing happened". This page (in the
// proxiland-privacy GitHub Pages repo) says the account is ready and links back into the app.
// It must also be on the Redirect URLs allow-list in the Supabase dashboard, or Supabase
// ignores it and falls back to the Site URL.
export const EMAIL_CONFIRM_REDIRECT_URL = 'https://mingjzhu01.github.io/proxiland-privacy/email-confirmed.html';
