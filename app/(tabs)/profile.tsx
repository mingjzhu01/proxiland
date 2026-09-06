// Locked, read-only view of your own profile. All editing (including first-time setup)
// happens in app/edit-profile.tsx — this screen just displays the result, with a single
// Edit button at the bottom. Sign-out, blocked users, and delete account moved to
// app/settings.tsx per the visual redesign — they don't need to compete with profile
// content on every visit.
import { useCallback, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { getMyProfile } from '../../lib/api/profile';
import { getMyProfileAttributes, type ProfileAttributes } from '../../lib/api/onboarding';
import { getMyNearbyIdentityVisibility, setMyNearbyIdentityVisibility } from '../../lib/api/feed';
import { formatEducation } from '../../lib/formatEducation';
import { ROLE_CATEGORY_LABELS, SENIORITY_BAND_LABELS, INDUSTRY_LABELS } from '../../lib/allowedValues';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { RedactedIdentity } from '../../components/RedactedIdentity';
import { SectionLabel } from '../../components/SectionLabel';
import { SecondaryButton } from '../../components/Buttons';
import { colors, avatarSizes, typeStyles, spacing, radii, fonts } from '../../lib/theme';
import type { Profile } from '../../lib/types';

export default function MyProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const line = attrs?.line_polished ?? attrs?.line_assembled ?? null;
  const education = formatEducation(profile);
  const subtitle = [profile.title, profile.employer].filter(Boolean).join(' at ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.topRow, { marginTop: insets.top }]}>
        <View style={styles.spacer} />
        <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

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

      <View style={styles.identityBlock}>
        <LetteredAvatar name={profile.full_name} photoUrl={profile.photo_url} size={avatarSizes.ownProfile} />
        <Text style={styles.name}>{profile.full_name || 'Unnamed'}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {profile.linkedin_verified ? (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={colors.live} />
            <Text style={styles.verifiedBadgeText}>LinkedIn verified</Text>
          </View>
        ) : (
          <Pressable style={styles.verifyChip} onPress={() => router.push('/edit-profile')}>
            <Text style={styles.verifyChipText}>Verify with LinkedIn</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.visibilityCard}>
        <View style={styles.visibilityTopRow}>
          <View style={styles.visibilityTextWrap}>
            <SectionLabel tone="brass" style={{ color: colors.brassOnDark }}>How you appear nearby</SectionLabel>
            <Text style={styles.visibilityState}>
              {nearbyVisibility === 'full' ? 'Full identity' : 'Anonymous until asked'}
            </Text>
          </View>
          <Switch
            value={nearbyVisibility === 'full'}
            onValueChange={handleToggleVisibility}
            disabled={isUpdatingVisibility}
          />
        </View>
        <View style={styles.visibilityDivider} />
        <View style={styles.previewRow}>
          {nearbyVisibility === 'anonymous' ? (
            <>
              <View style={styles.previewScale}>
                <RedactedIdentity />
              </View>
            </>
          ) : (
            <>
              <LetteredAvatar name={profile.full_name} photoUrl={profile.photo_url} size={34} />
              <Text style={styles.previewLine}>{profile.full_name}</Text>
            </>
          )}
        </View>
        {nearbyVisibility === 'anonymous' && line ? <Text style={styles.previewLineFull}>{line}</Text> : null}
      </View>

      <View style={styles.detailsCard}>
        {subtitle ? <DetailRow label="Employer & title" value={subtitle} /> : null}
        {education ? <DetailRow label="Education" value={education} /> : null}
        {attrs ? (
          <DetailRow
            label="Role · Industry · Seniority"
            value={[
              ROLE_CATEGORY_LABELS[attrs.role_category],
              INDUSTRY_LABELS[attrs.industry],
              SENIORITY_BAND_LABELS[attrs.seniority_band],
            ].join(' · ')}
          />
        ) : null}
        {attrs?.looking_for ? <DetailRow label="Looking for" value={attrs.looking_for} /> : null}
        {attrs?.can_offer ? <DetailRow label="Can offer" value={attrs.can_offer} /> : null}
        {profile.bio ? <DetailRow label="Bio" value={profile.bio} last /> : null}
      </View>

      <SecondaryButton label="Edit profile" onPress={() => router.push('/edit-profile')} />
    </ScrollView>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowDivider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.paper },
  loadingText: { color: colors.textSecondary },
  content: { padding: spacing.gutter, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  spacer: { flex: 1 },
  identityBlock: { alignItems: 'center', marginTop: 12, gap: 4 },
  name: { ...typeStyles.screenHeadline, fontSize: 26, marginTop: 8 },
  subtitle: { fontFamily: fonts.wordmark, fontSize: 13.5, color: colors.textSecondary },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.liveChipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  verifiedBadgeText: { fontFamily: fonts.wordmark, fontSize: 11, fontWeight: '600', color: colors.liveChipText },
  verifyChip: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 6,
  },
  verifyChipText: { fontFamily: fonts.wordmark, fontSize: 11.5, fontWeight: '600', color: colors.textSecondary },
  visibilityCard: { backgroundColor: colors.brand, borderRadius: radii.card, padding: 17, marginTop: 22 },
  visibilityTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibilityTextWrap: { flex: 1, gap: 4 },
  visibilityState: { fontFamily: fonts.wordmark, fontSize: 15, fontWeight: '600', color: colors.inkOn },
  visibilityDivider: { height: 1, backgroundColor: 'rgba(245,239,230,.16)', marginVertical: 14 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewScale: { transform: [{ scale: 0.85 }], marginLeft: -6 },
  previewLine: { ...typeStyles.matchRationaleChat, color: colors.inkOn, flex: 1 },
  previewLineFull: { fontFamily: fonts.wordmark, fontSize: 16, color: colors.inkOn, marginTop: 10 },
  detailsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    marginTop: 20,
    marginBottom: 24,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  detailRow: { paddingVertical: 13 },
  detailRowDivider: { borderBottomWidth: 1, borderColor: colors.ruleInner },
  detailLabel: { fontFamily: fonts.wordmark, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.textMuted, marginBottom: 4 },
  detailValue: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.ink },
  buttonDisabled: { opacity: 0.5 },
  securityBanner: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  securityBannerTitle: { fontFamily: fonts.wordmark, fontSize: 14, fontWeight: '700', color: colors.brass },
  securityBannerText: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.textTertiary, marginTop: 4 },
  securityBannerButton: {
    backgroundColor: colors.brass,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  securityBannerButtonText: { fontFamily: fonts.wordmark, color: colors.inkOn, fontSize: 13, fontWeight: '600' },
});
