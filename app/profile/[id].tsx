import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProfile } from '../../lib/api/profile';
import { sendRequest } from '../../lib/api/requests';
import { blockUser, getConnectionWith } from '../../lib/api/connections';
import { fetchOverlap, type Overlap } from '../../lib/api/reveal';
import { formatEducation } from '../../lib/formatEducation';
import { ReportSheet } from '../../components/ReportSheet';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { WhyYouTwo } from '../../components/WhyYouTwo';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, avatarSizes, spacing, radii, fonts } from '../../lib/theme';
import type { Profile } from '../../lib/types';

export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<Overlap>(null);
  const [isSending, setIsSending] = useState(false);

  const [coffeeModalVisible, setCoffeeModalVisible] = useState(false);
  const [coffeeMessage, setCoffeeMessage] = useState('');
  const [coffeeLocation, setCoffeeLocation] = useState('');
  const [coffeeDate, setCoffeeDate] = useState(new Date());
  const [coffeeTime, setCoffeeTime] = useState(new Date());
  const [reportVisible, setReportVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setHasLoaded(false);
      getProfile(id).then((p) => {
        setProfile(p);
        setHasLoaded(true);
      });
      getConnectionWith(id).then(setConnectionId);
      fetchOverlap(id).then(setOverlap).catch(() => setOverlap(null));
    }, [id])
  );

  async function handleConnect() {
    if (!id) return;
    setIsSending(true);
    try {
      await sendRequest(id, 'connect');
      Alert.alert('Sent', 'Connection request sent.');
    } catch (error: any) {
      Alert.alert('Could not send request', error.message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendCoffee() {
    if (!id) return;
    const meetingAt = new Date(coffeeDate);
    meetingAt.setHours(coffeeTime.getHours(), coffeeTime.getMinutes(), 0, 0);

    setIsSending(true);
    try {
      await sendRequest(id, 'coffee', {
        message: coffeeMessage.trim() || undefined,
        meetingLocation: coffeeLocation.trim() || undefined,
        meetingAt,
      });
      setCoffeeModalVisible(false);
      setCoffeeMessage('');
      setCoffeeLocation('');
      Alert.alert('Sent', 'Coffee request sent.');
    } catch (error: any) {
      Alert.alert('Could not send request', error.message);
    } finally {
      setIsSending(false);
    }
  }

  function handleBlockOrReport() {
    if (!id) return;
    Alert.alert('Block or Report', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          await blockUser(id);
          router.back();
        },
      },
      { text: 'Report', onPress: () => setReportVisible(true) },
    ]);
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <View style={styles.spacer} />
      <Pressable onPress={handleBlockOrReport} hitSlop={12}>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  if (!profile) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centered}>
          <Text style={styles.loadingText}>{hasLoaded ? "This profile isn't available right now." : 'Loading…'}</Text>
        </View>
      </View>
    );
  }

  const subtitle = [profile.title, profile.employer].filter(Boolean).join(' at ');
  const education = formatEducation(profile);

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identityBlock}>
          <LetteredAvatar name={profile.full_name} photoUrl={profile.photo_url} size={avatarSizes.ownProfile} />
          <Text style={styles.name}>{profile.full_name}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {profile.linkedin_verified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={13} color={colors.live} />
              <Text style={styles.verifiedBadgeText}>LinkedIn verified</Text>
            </View>
          ) : null}
          {profile.linkedin_url ? (
            <Pressable onPress={() => Linking.openURL(profile.linkedin_url!)}>
              <Text style={styles.linkedinLink}>View LinkedIn profile</Text>
            </Pressable>
          ) : null}
        </View>

        {overlap ? (
          <View style={styles.whyCard}>
            <WhyYouTwo reason={overlap.phrase} variant="plain" />
          </View>
        ) : null}

        {(subtitle || education || profile.bio) ? (
          <View style={styles.detailsCard}>
            {subtitle ? <DetailRow label="Employer & title" value={subtitle} /> : null}
            {education ? <DetailRow label="Education" value={education} /> : null}
            {profile.bio ? <DetailRow label="Bio" value={profile.bio} last /> : null}
          </View>
        ) : null}

        {connectionId ? (
          <View style={styles.buttonStack}>
            <PrimaryButton label="Message" onPress={() => router.push(`/chat/${connectionId}`)} />
            <SecondaryButton
              label="Ask for coffee"
              loading={isSending}
              onPress={() => setCoffeeModalVisible(true)}
            />
          </View>
        ) : (
          <View style={styles.buttonStack}>
            <PrimaryButton label="Connect" loading={isSending} onPress={handleConnect} />
            <Text style={styles.coffeeHint}>Connect first to schedule a coffee chat</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={coffeeModalVisible} animationType="slide" transparent onRequestClose={() => setCoffeeModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.grabHandle} />
            <Text style={styles.modalTitle}>Ask {profile.full_name.split(' ')[0]} for coffee</Text>

            <View style={styles.modalDivider} />
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Free to grab coffee?"
              placeholderTextColor={colors.textMuted}
              value={coffeeMessage}
              onChangeText={setCoffeeMessage}
            />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Blue Bottle on Market St"
              placeholderTextColor={colors.textMuted}
              value={coffeeLocation}
              onChangeText={setCoffeeLocation}
            />

            <Text style={styles.fieldLabel}>Date</Text>
            <DateTimePicker
              value={coffeeDate}
              mode="date"
              display="compact"
              minimumDate={new Date()}
              onChange={(_, date) => date && setCoffeeDate(date)}
            />

            <Text style={styles.fieldLabel}>Time</Text>
            <DateTimePicker
              value={coffeeTime}
              mode="time"
              display="compact"
              onChange={(_, time) => time && setCoffeeTime(time)}
            />

            <View style={styles.modalFooter}>
              <PrimaryButton label="Send coffee request" loading={isSending} onPress={handleSendCoffee} />
              <Pressable style={styles.cancelLink} onPress={() => setCoffeeModalVisible(false)}>
                <Text style={styles.cancelLinkText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ReportSheet
        visible={reportVisible}
        targetUserId={id ?? null}
        context="profile"
        onClose={() => setReportVisible(false)}
      />
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.gutter,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.rule,
  },
  spacer: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary },
  content: { padding: spacing.gutter, alignItems: 'center' },
  identityBlock: { alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.wordmark, fontSize: 26, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.wordmark, fontSize: 13.5, color: colors.textSecondary, textAlign: 'center' },
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
  linkedinLink: { fontFamily: fonts.wordmark, color: colors.brass, fontSize: 13, marginTop: 6, textDecorationLine: 'underline' },
  whyCard: {
    width: '100%',
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    padding: 16,
    marginTop: 20,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    marginTop: 20,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  detailRow: { paddingVertical: 13 },
  detailRowDivider: { borderBottomWidth: 1, borderColor: colors.ruleInner },
  detailLabel: { fontFamily: fonts.wordmark, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.textMuted, marginBottom: 4 },
  detailValue: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.ink },
  buttonStack: { width: '100%', gap: 10, marginTop: 24 },
  coffeeHint: { fontFamily: fonts.wordmark, color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(36,28,22,.42)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.paper, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: 20, paddingBottom: 32 },
  grabHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.dashedBorder, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.wordmark, fontSize: 24, color: colors.ink },
  modalDivider: { height: 1, backgroundColor: colors.rule, marginTop: 16, marginBottom: 4 },
  fieldLabel: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.textTertiary, marginBottom: 4, marginTop: 14 },
  input: { fontFamily: fonts.wordmark, borderWidth: 1, borderColor: colors.rule, borderRadius: 10, padding: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  modalFooter: { marginTop: 20 },
  cancelLink: { alignItems: 'center', marginTop: 14 },
  cancelLinkText: { fontFamily: fonts.wordmark, color: colors.textTertiary, fontSize: 14, fontWeight: '600' },
});
