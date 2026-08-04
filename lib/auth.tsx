import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  // null = not yet checked for the current session. Drives the "send new users to
  // onboarding" redirect in app/_layout.tsx (spec v4 section 9).
  hasProfile: boolean | null;
  refreshHasProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isLoading: true,
  hasProfile: null,
  refreshHasProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  async function checkHasProfile(userId: string) {
    const { data } = await supabase
      .from('profile_attributes')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    setHasProfile(!!data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
      if (data.session) checkHasProfile(data.session.user.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        checkHasProfile(newSession.user.id);
      } else {
        setHasProfile(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function refreshHasProfile() {
    if (session) await checkHasProfile(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, isLoading, hasProfile, refreshHasProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
