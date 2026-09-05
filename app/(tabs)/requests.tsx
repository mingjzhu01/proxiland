import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getIncomingRequests, getOutgoingRequests, respondToRequest, hideRequestForMe } from '../../lib/api/requests';
import { getIncomingRevealRequests, revealRequest, type IncomingRevealRequest } from '../../lib/api/reveal';
import { useRequestsBadge } from '../../lib/requestsBadge';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { Card } from '../../components/Card';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { SectionLabel } from '../../components/SectionLabel';
import { SegmentedControl, type Segment } from '../../components/SegmentedControl';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, avatarSizes, typeStyles, spacing } from '../../lib/theme';
import type { ConnectionRequest } from '../../lib/types';

function formatMeetingTime(meetingAt: string | null): string | null {
  if (!meetingAt) return null;
  return new Date(meetingAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Requests() {
  const [incoming, setIncoming] = useState<ConnectionRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequest[]>([]);
  const [incomingReveals, setIncomingReveals] = useState<IncomingRevealRequest[]>([]);
  const [ignoredRevealIds, setIgnoredRevealIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'waiting' | 'sent'>('waiting');
  const [isLoading, setIsLoading] = useState(false);
  const { refresh: refreshBadge } = useRequestsBadge();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [inc, out, incReveals] = await Promise.all([
        getIncomingRequests(),
        getOutgoingRequests(),
        getIncomingRevealRequests(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      setIncomingReveals(incReveals);
    } catch (error: any) {
      Alert.alert('Could not load requests', error.message);
    } finally {
      setIsLoading(false);
    }
    refreshBadge();
  }, [refreshBadge]);

  async function handleReveal(id: string) {
    try {
      await revealRequest(id);
      setIncomingReveals((list) => list.filter((r) => r.id !== id));
    } catch (error: any) {
      // A stale item (loaded under a different session, or already resolved/expired
      // elsewhere) fails here rather than silently succeeding — RLS/the RPC's own auth check
      // already guarantee that. Refresh so it drops off screen instead of sitting there stuck.
      const message: string = error.message ?? String(error);
      const isStale = message.includes('Not authorized') || message.includes('no longer pending');
      Alert.alert(
        'Could not share your profile',
        isStale ? 'This request is no longer available.' : message
      );
      if (isStale) load();
    }
  }

  // Local-only dismiss — there's no backend "decline a reveal request" state today (only
  // accept). Hides it from this device's list without persisting; it'll reappear on reload.
  // A real decline mechanism (mirroring hideRequestForMe for connection_requests) is a
  // follow-up, not a presentation-layer change.
  function handleIgnore(id: string) {
    setIgnoredRevealIds((prev) => new Set(prev).add(id));
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRespond(id: string, status: 'accepted' | 'declined') {
    await respondToRequest(id, status);
    load();
  }

  async function handleDelete(id: string) {
    try {
      await hideRequestForMe(id);
      setOutgoing((list) => list.filter((r) => r.id !== id));
    } catch (error: any) {
      Alert.alert('Could not delete', error.message);
    }
  }

  const visibleReveals = incomingReveals.filter((r) => !ignoredRevealIds.has(r.id));
  const waitingCount = visibleReveals.length + incoming.length;
  const segments: Segment[] = [
    { key: 'waiting', label: 'Waiting', count: waitingCount },
    { key: 'sent', label: 'Sent', count: outgoing.length },
  ];

  return (
    <FlatList
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.brand} />}
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <SectionLabel tone="brass">Requests</SectionLabel>
            <Text style={styles.headline}>
              {waitingCount > 0
                ? `${waitingCount} ${waitingCount === 1 ? 'person is' : 'people are'} waiting on you`
                : "You're all caught up"}
            </Text>
            <SegmentedControl segments={segments} activeKey={tab} onChange={(k) => setTab(k as typeof tab)} />
          </View>

          {tab === 'waiting' ? (
            <>
              {visibleReveals.map((req) => (
                <Card key={req.id} style={styles.card}>
                  <View style={styles.headRow}>
                    <LetteredAvatar name={req.requester?.full_name ?? null} photoUrl={req.requester?.photo_url} size={avatarSizes.matchCard} />
                    <View style={styles.headInfo}>
                      <Text style={typeStyles.cardName}>{req.requester?.full_name ?? 'Someone'}</Text>
                      {req.requester?.headline ? <Text style={typeStyles.cardSubtitle}>{req.requester.headline}</Text> : null}
                    </View>
                    <View style={styles.askedBadge}>
                      <Text style={styles.askedBadgeText}>Asked</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <SectionLabel tone="brass" style={styles.whyLabel}>Why she asked</SectionLabel>
                  <Text style={styles.revealLine}>{req.connection_line}</Text>
                  <Text style={styles.explainer}>
                    She can already see your profile. Sharing back is what opens the conversation.
                  </Text>
                  <View style={styles.buttonRow}>
                    <View style={styles.flex1}>
                      <PrimaryButton label="Share my profile" onPress={() => handleReveal(req.id)} />
                    </View>
                    <View style={styles.flex1}>
                      <SecondaryButton label="Ignore" onPress={() => handleIgnore(req.id)} />
                    </View>
                  </View>
                </Card>
              ))}

              {incoming.length === 0 && visibleReveals.length === 0 ? (
                <Text style={styles.empty}>No one's waiting on you right now.</Text>
              ) : (
                incoming.map((req) => (
                  <Card key={req.id} style={styles.card}>
                    <View style={styles.headRow}>
                      <LetteredAvatar name={req.sender?.full_name ?? null} photoUrl={req.sender?.photo_url} size={avatarSizes.matchCard} />
                      <View style={styles.headInfo}>
                        <Text style={typeStyles.cardName}>{req.sender?.full_name ?? 'Someone'}</Text>
                        <Text style={typeStyles.cardSubtitle}>
                          {req.type === 'coffee' ? 'Wants to grab coffee' : 'Wants to connect'}
                        </Text>
                      </View>
                      {req.type === 'coffee' ? (
                        <View style={styles.coffeeBadge}>
                          <Text style={styles.coffeeBadgeText}>Coffee</Text>
                        </View>
                      ) : null}
                    </View>
                    {req.type === 'coffee' && (formatMeetingTime(req.meeting_at) || req.meeting_location) ? (
                      <View style={styles.meetingBlock}>
                        <Text style={styles.meetingLine}>{formatMeetingTime(req.meeting_at)}</Text>
                        {req.meeting_location ? <Text style={styles.meetingLine}>{req.meeting_location}</Text> : null}
                      </View>
                    ) : null}
                    {req.message ? <Text style={styles.messageQuote}>"{req.message}"</Text> : null}
                    <View style={styles.buttonRow}>
                      <View style={styles.flex1}>
                        <PrimaryButton label="Accept" onPress={() => handleRespond(req.id, 'accepted')} />
                      </View>
                      <View style={styles.flex1}>
                        <SecondaryButton label="Decline" onPress={() => handleRespond(req.id, 'declined')} />
                      </View>
                    </View>
                  </Card>
                ))
              )}
            </>
          ) : (
            <>
              <Text style={styles.hint}>Swipe left to remove from your history</Text>
              {outgoing.length === 0 ? (
                <Text style={styles.empty}>No sent requests.</Text>
              ) : (
                outgoing.map((req) => (
                  <SwipeToDelete key={req.id} onDelete={() => handleDelete(req.id)}>
                    <View style={styles.sentRow}>
                      <LetteredAvatar name={req.receiver?.full_name ?? null} photoUrl={req.receiver?.photo_url} size={avatarSizes.compactRow} />
                      <View style={styles.headInfo}>
                        <Text style={typeStyles.cardName}>{req.receiver?.full_name ?? 'Someone'}</Text>
                        <Text style={[typeStyles.cardTertiary, req.status === 'accepted' && styles.acceptedStatus]}>
                          {req.type === 'coffee' ? 'Coffee' : 'Connection'} · {req.status}
                        </Text>
                      </View>
                    </View>
                  </SwipeToDelete>
                ))
              )}
            </>
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: spacing.gutter, paddingTop: 14, paddingBottom: 16 },
  headline: { ...typeStyles.screenHeadline, marginTop: 8, marginBottom: 16 },
  card: { marginHorizontal: spacing.gutter, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headInfo: { flex: 1, gap: 2 },
  askedBadge: { backgroundColor: colors.brassChipBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  askedBadgeText: { fontSize: 11, fontWeight: '600', color: colors.brassChipText },
  coffeeBadge: { backgroundColor: colors.liveChipBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  coffeeBadgeText: { fontSize: 11, fontWeight: '600', color: colors.liveChipText },
  divider: { height: 1, backgroundColor: colors.ruleInner, marginVertical: 14 },
  whyLabel: { marginBottom: 8 },
  revealLine: { ...typeStyles.matchRationaleChat, marginBottom: 10 },
  explainer: { fontSize: 12, color: colors.textTertiary, marginBottom: 14, lineHeight: 17 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex1: { flex: 1 },
  meetingBlock: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.ruleInner,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 4,
  },
  meetingLine: { fontSize: 13.5, color: colors.textSecondary },
  messageQuote: { fontSize: 14, color: colors.ink, fontStyle: 'italic', marginTop: 12 },
  empty: { paddingHorizontal: spacing.gutter, paddingBottom: 16, color: colors.textMuted, fontSize: 14 },
  hint: { paddingHorizontal: spacing.gutter, paddingBottom: 12, color: colors.textMuted, fontSize: 11 },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    backgroundColor: colors.paper,
  },
  acceptedStatus: { color: colors.liveChipText, fontWeight: '600' },
});
