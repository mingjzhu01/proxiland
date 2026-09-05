// Locked, read-only view of your own profile. All editing (including first-time setup)
// happens in app/edit-profile.tsx — this screen just displays the result, with a single
// Edit button at the bottom.
import { useCallback, useState } from 'react';
import { View, Text, Image, Pressable, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getMyProfile } from '../../lib/api/profile';
import { getMyProfileAttributes, type ProfileAttributes } from '../../lib/api/onboarding';
import { getMyNearbyIdentityVisibility, setMyNearbyIdentityVisibility } from '../../lib/api/feed';
import { formatEducation } from '../../lib/formatEducation';
import { ROLE_CATEGORY_LABELS, SENIORITY_BAND_LABELS, INDUSTRY_LABELS } from '../../lib/allowedValues';
import type { Profile } from '../../lib/types';

export default function MyProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attrs, setAttrs] = useState<ProfileAttributes | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [nearbyVisibility, setNearbyVisibility] = useState<'anonymous' | 'full'>('full');
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    setUserEmail(userData.user?.email ?? null);
    setEmailConfirmed(!!userData.user?.email_confirmed_at);

    const [p, a, visibility] = await Promise.all([
      getMyProfile(),
      getMyProfileAttributes(),
      getMyNearbyIdentityVisibility().catch(() => 'full' as const),
    ]);
    setProfile(p);
    setAttrs(a);
    setNearbyVisibility(visibility);
  }, []);

  async function handleToggleVisibility(showFull: boolean) {
    const next = showFull ? 'full' : 'anonymous';
    const previous = nearbyVisibility;
    setNearbyVisibility(next);
    setIsUpdatingVisibility(true);
    try {
      await setMyNearbyIdentityVisibility(next);
    } catch (error: any) {
      setNearbyVisibility(previous);
      Alert.alert('Could not update', error.message ?? String(error));
    } finally {
      setIsUpdatingVisibility(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleResendVerification() {
    if (!userEmail) return;
    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: userEmail });
      if (error) throw error;
      Alert.alert('Sent', 'Check your email for a verification link.');
    } catch (error: any) {
      Alert.alert('Could not send', error.message);
    } finally {
      setIsResending(false);
    }
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const line = attrs?.line_polished ?? attrs?.line_assembled ?? null;
  const education = formatEducation(profile);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!emailConfirmed ? (
        <View style={styles.securityBanner}>
          <Text style={styles.securityBannerTitle}>Verify your email</Text>
          <Text style={styles.securityBannerText}>
            Confirming your email helps keep Proxiland trustworthy for everyone.
          </Text>
          <Pressable
            style={[styles.securityBannerButton, isResending && styles.buttonDisabled]}
            onPress={handleResendVerification}
            disabled={isResending}
          >
            <Text style={styles.securityBannerButtonText}>
              {isResending ? 'Sending…' : 'Resend verification email'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.avatarWrap}>
        {profile.photo_url ? (
          <Image source={{ uri: profile.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarPlaceholderText}>No photo</Text>
          </View>
        )}
      </View>

      <Text style={styles.name}>{profile.full_name || 'Unnamed'}</Text>

      <View style={styles.anonSection}>
        <View style={styles.visibilityRow}>
          <View style={styles.visibilityTextWrap}>
            <Text style={styles.anonLabel}>Show your full identity in Nearby</Text>
            <Text style={styles.visibilityHint}>
              {nearbyVisibility === 'full'
                ? "On — people nearby see your real name and photo, same as at an event."
                : 'Off — you appear as an anonymized card until someone asks to connect.'}
            </Text>
          </View>
          <Switch
            value={nearbyVisibility === 'full'}
            onValueChange={handleToggleVisibility}
            disabled={isUpdatingVisibility}
          />
        </View>
        {nearbyVisibility === 'anonymous' && line ? (
          <>
            <Text style={[styles.anonLabel, styles.anonLinePreviewLabel]}>How you appear</Text>
            <Text style={styles.anonLine}>{line}</Text>
          </>
        ) : null}
      </View>

      {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}

      {(profile.title || profile.employer) ? (
        <Row label="Employer & title" value={[profile.title, profile.employer].filter(Boolean).join(' at ')} />
      ) : null}
      {education ? <Row label="Education" value={education} /> : null}
      {profile.bio ? <Row label="Bio" value={profile.bio} /> : null}

      {attrs ? (
        <>
          <Row
            label="Role / Industry / Seniority"
            value={[
              ROLE_CATEGORY_LABELS[attrs.role_category],
              INDUSTRY_LABELS[attrs.industry],
              SENIORITY_BAND_LABELS[attrs.seniority_band],
            ].join(' · ')}
          />
          {attrs.looking_for ? <Row label="Looking for" value={attrs.looking_for} /> : null}
          {attrs.can_offer ? <Row label="Can offer" value={attrs.can_offer} /> : null}
        </>
      ) : null}

      <View style={styles.linkedinRow}>
        {profile.linkedin_verified ? (
          <Text style={styles.verifiedBadge}>✓ LinkedIn Verified</Text>
        ) : (
          <Text style={styles.notVerified}>LinkedIn not verified</Text>
        )}
      </View>

      <Pressable style={styles.editButton} onPress={() => router.push('/edit-profile')}>
        <Text style={styles.editButtonText}>Edit profile</Text>
      </Pressable>

      <Pressable style={styles.blockedLink} onPress={() => router.push('/blocked-users')}>
        <Text style={styles.blockedLinkText}>Blocked users</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable style={styles.deleteAccountButton} onPress={() => router.push('/delete-account')}>
        <Text style={styles.deleteAccountText}>Delete account</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 60 },
  avatarWrap: { alignSelf: 'center', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#888', fontSize: 12 },
  name: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  headline: { fontSize: 14, color: '#555', textAlign: 'center', marginTop: 4, marginBottom: 8 },
  anonSection: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  anonLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 4 },
  anonLinePreviewLabel: { marginTop: 12 },
  anonLine: { fontSize: 15, color: '#111' },
  visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibilityTextWrap: { flex: 1 },
  visibilityHint: { fontSize: 12, color: '#888', marginTop: 4, lineHeight: 16 },
  row: { marginTop: 16 },
  rowLabel: { fontSize: 12, color: '#888', marginBottom: 2 },
  rowValue: { fontSize: 15, color: '#111' },
  linkedinRow: { marginTop: 20, alignItems: 'center' },
  verifiedBadge: { color: '#0A66C2', fontWeight: '700', fontSize: 14 },
  notVerified: { color: '#999', fontSize: 13 },
  editButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 28 },
  editButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  securityBanner: {
    backgroundColor: '#fdf6ee',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f0dfc4',
  },
  securityBannerTitle: { fontSize: 14, fontWeight: '700', color: '#a05a2c' },
  securityBannerText: { fontSize: 13, color: '#775a3c', marginTop: 4 },
  securityBannerButton: {
    backgroundColor: '#a05a2c',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  securityBannerButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  blockedLink: { alignItems: 'center', marginTop: 24 },
  blockedLinkText: { color: '#666', fontSize: 14 },
  signOutButton: { alignItems: 'center', marginTop: 12 },
  signOutText: { color: '#cc3333', fontSize: 14 },
  deleteAccountButton: { alignItems: 'center', marginTop: 24, paddingVertical: 10 },
  deleteAccountText: { color: '#cc3333', fontSize: 14, fontWeight: '700' },
});
