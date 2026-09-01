import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registerForPushNotifications } from './pushNotifications';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  // null = not yet checked for the current session. Drives the "send new users to
  // onboarding" redirect in app/_layout.tsx (spec v4 section 9).
  hasProfile: boolean | null;
  refreshHasProfile: () => Promise<void>;
  // True only for the flagged App Store review demo account — drives the "Demo mode" pill
  // (see app/(tabs)/nearby.tsx). Client-derived display only; actual containment is enforced
  // at the database level (migration 0043), not by this flag.
  isDemo: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isLoading: true,
  hasProfile: null,
  refreshHasProfile: async () => {},
  isDemo: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  async function checkHasProfile(userId: string) {
    const { data } = await supabase
      .from('profile_attributes')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    setHasProfile(!!data);
  }

  async function checkIsDemo(userId: string) {
    const { data } = await supabase.from('profiles').select('is_demo').eq('id', userId).maybeSingle();
    setIsDemo(data?.is_demo ?? false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
      if (data.session) {
        checkHasProfile(data.session.user.id);
        checkIsDemo(data.session.user.id);
        registerForPushNotifications();
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        checkHasProfile(newSession.user.id);
        checkIsDemo(newSession.user.id);
        registerForPushNotifications();
      } else {
        setHasProfile(null);
        setIsDemo(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function refreshHasProfile() {
    if (session) await checkHasProfile(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, isLoading, hasProfile, refreshHasProfile, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
