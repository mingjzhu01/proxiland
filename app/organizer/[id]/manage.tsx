import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getMyOrganizedEvents,
  getEventManagementSummary,
  getEventParticipantsForOrganizer,
  removeEventParticipant,
  rotateEventInvite,
  publishEvent,
  endEventEarly,
  type OrganizedEvent,
  type EventManagementSummary,
  type OrganizerParticipant,
} from '../../../lib/api/organizer';
import { Card } from '../../../components/Card';
import { PrimaryButton, SecondaryButton } from '../../../components/Buttons';
import { SectionLabel } from '../../../components/SectionLabel';
import { logSessionEvent } from '../../../lib/api/instrumentation';
import { colors, spacing, typeStyles, fonts, radii } from '../../../lib/theme';

export default function ManageEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<OrganizedEvent | null>(null);
  const [summary, setSummary] = useState<EventManagementSummary | null>(null);
  const [participants, setParticipants] = useState<OrganizerParticipant[]>([]);
  const [invite, setInvite] = useState<{ rawToken: string; rawShortCode: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [events, mgmtSummary, list] = await Promise.all([
        getMyOrganizedEvents(),
        getEventManagementSummary(id),
        getEventParticipantsForOrganizer(id),
      ]);
      setEvent(events.find((e) => e.id === id) ?? null);
      setSummary(mgmtSummary);
      setParticipants(list);
    } catch (error: any) {
      Alert.alert('Could not load event', error.message ?? String(error));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleGenerateInvite() {
    setIsBusy(true);
    try {
      setInvite(await rotateEventInvite(id));
    } catch (error: any) {
      Alert.alert('Could not generate invite', error.message ?? String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePublish() {
    setIsBusy(true);
    try {
      await publishEvent(id);
      await load();
    } catch (error: any) {
      Alert.alert('Could not publish', error.message ?? String(error));
    } finally {
      setIsBusy(false);
    }
  }

  function handleEndEarly() {
    Alert.alert('End this event now?', 'Attendees will stop being able to check in or discover each other.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End event',
        style: 'destructive',
        onPress: async () => {
          setIsBusy(true);
          try {
            await endEventEarly(id);
            logSessionEvent('event_ended_early', { scopeId: id });
            await load();
          } catch (error: any) {
            Alert.alert('Could not end event', error.message ?? String(error));
          } finally {
            setIsBusy(false);
          }
        },
      },
    ]);
  }

  function handleRemove(participant: OrganizerParticipant) {
    Alert.alert(
      `Remove ${participant.full_name ?? 'this attendee'}?`,
      'They will lose access to this event and cannot rejoin with the same invite.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeEventParticipant(id, participant.user_id);
              logSessionEvent('event_participant_removed', { scopeId: id });
              await load();
            } catch (error: any) {
              Alert.alert('Could not remove', error.message ?? String(error));
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Event not found.</Text>
      </View>
    );
  }

  const activeParticipants = participants.filter((p) => p.status === 'active');

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.textTertiary} />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable onPress={() => router.push(`/organizer/${id}/edit`)} hitSlop={10}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>

      <Text style={styles.headline}>{event.name || 'Untitled event'}</Text>
      <SectionLabel tone={event.status === 'active' ? 'brass' : 'muted'} style={styles.statusLabel}>
        {event.status === 'draft' ? 'Draft — not visible to anyone yet' : event.status === 'active' ? 'Live' : 'Ended'}
      </SectionLabel>

      <Card style={styles.summaryCard}>
        <SummaryStat label="Joined" value={summary?.joined_count ?? 0} />
        <View style={styles.summaryDivider} />
        <SummaryStat label="Completed intent" value={summary?.completed_intent_count ?? 0} />
        <View style={styles.summaryDivider} />
        <SummaryStat label="Checked in" value={summary?.checked_in_count ?? 0} />
      </Card>

      {event.status === 'draft' ? (
        <View style={styles.actionBlock}>
          <PrimaryButton label="Publish event" loading={isBusy} onPress={handlePublish} />
          <Text style={styles.actionHint}>Generate an invite link first if you haven't yet.</Text>
        </View>
      ) : null}

      {event.status === 'active' ? (
        <View style={styles.actionBlock}>
          <SecondaryButton label="End event now" loading={isBusy} onPress={handleEndEarly} />
        </View>
      ) : null}

      <Card style={styles.inviteCard}>
        <Text style={styles.cardTitle}>Invitation</Text>
        {invite ? (
          <>
            <Text style={styles.inviteLabel}>Link (tap and hold to copy)</Text>
            <Text style={styles.inviteValue} selectable>
              proxiland://event-join/{invite.rawToken}
            </Text>
            <Text style={styles.inviteLabel}>Event code</Text>
            <Text style={styles.inviteCode} selectable>
              {invite.rawShortCode}
            </Text>
            <Text style={styles.inviteWarning}>
              Shown once — save it now. Generating a new invite invalidates this one.
            </Text>
          </>
        ) : (
          <Text style={styles.inviteHelper}>
            Generate a link and code to share with attendees. Doing this again replaces the
            previous invite.
          </Text>
        )}
        <SecondaryButton label={invite ? 'Generate new invite' : 'Generate invite'} loading={isBusy} onPress={handleGenerateInvite} />
      </Card>

      <Text style={styles.sectionHeading}>Attendees ({activeParticipants.length})</Text>
      {activeParticipants.length === 0 ? (
        <Text style={styles.emptyText}>No one has joined yet.</Text>
      ) : (
        activeParticipants.map((p) => (
          <View key={p.user_id} style={styles.participantRow}>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{p.full_name ?? 'Unnamed'}</Text>
              <Text style={styles.participantMeta}>
                {p.intent_completed ? 'Intent complete' : 'Intent not set'}
                {p.checked_in_at ? ' · Checked in' : ''}
              </Text>
            </View>
            <Pressable style={styles.removeButton} onPress={() => handleRemove(p)}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  loadingText: { fontFamily: fonts.wordmark, color: colors.textSecondary },
  content: { padding: spacing.gutter, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  editLink: { fontFamily: fonts.wordmark, fontSize: 14, fontWeight: '600', color: colors.brass },
  headline: { ...typeStyles.screenHeadline, marginTop: 12 },
  statusLabel: { marginTop: 8 },
  summaryCard: { flexDirection: 'row', marginTop: 20 },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.ruleInner },
  summaryValue: { fontFamily: fonts.wordmark, fontSize: 24, color: colors.ink },
  summaryLabel: { fontFamily: fonts.wordmark, fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  actionBlock: { marginTop: 16 },
  actionHint: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  inviteCard: { marginTop: 20 },
  cardTitle: { fontFamily: fonts.wordmark, fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  inviteHelper: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.textTertiary, lineHeight: 19, marginBottom: 14 },
  inviteLabel: { fontFamily: fonts.wordmark, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.textMuted, marginTop: 10, marginBottom: 4 },
  inviteValue: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.ink },
  inviteCode: { fontFamily: fonts.wordmark, fontSize: 22, letterSpacing: 4, color: colors.ink },
  inviteWarning: { fontFamily: fonts.wordmark, fontSize: 11.5, color: colors.brass, marginTop: 10, marginBottom: 14 },
  sectionHeading: { fontFamily: fonts.wordmark, fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 28, marginBottom: 10 },
  emptyText: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.textTertiary },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.ruleInner,
  },
  participantInfo: { flex: 1, gap: 2 },
  participantName: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.ink },
  participantMeta: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.textTertiary },
  removeButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.error },
  removeButtonText: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.error, fontWeight: '600' },
});
