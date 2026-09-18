// Discover's Events context, per the discover-events handoff §3: Join (the one filled tile),
// Create (outlined), then the user's events — the live one first, upcoming after. With four or
// more events the actions compact so the list leads. Nothing here needs new backend: past
// events and attendee counts aren't in get_my_active_events, so those pieces are omitted, as
// the handoff allows.
import { useCallback, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { getMyActiveEvents, type EventSummary } from '../../lib/api/events';
import { JoinEventSheet } from '../JoinEventSheet';
import { colors, fonts } from '../../lib/theme';

const COMPACT_THRESHOLD = 4;

type Classified = { event: EventSummary; live: boolean };

function classify(events: EventSummary[]): Classified[] {
  const now = Date.now();
  const withFlag = events.map((event) => {
    const starts = event.starts_at ? new Date(event.starts_at).getTime() : null;
    const live = starts === null || starts <= now;
    return { event, live };
  });
  const startOf = (e: EventSummary) => (e.starts_at ? new Date(e.starts_at).getTime() : 0);
  return [
    ...withFlag.filter((c) => c.live).sort((a, b) => startOf(b.event) - startOf(a.event)),
    ...withFlag.filter((c) => !c.live).sort((a, b) => startOf(a.event) - startOf(b.event)),
  ];
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function time(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function whenLine(event: EventSummary): string | null {
  if (!event.starts_at) return null;
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const day = sameDay(start, new Date())
    ? 'Today'
    : start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const range = end && sameDay(start, end) ? `${time(start)} – ${time(end)}` : time(start);
  return `${day} · ${range}`;
}

export function EventsView({ control }: { control: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setEvents(await getMyActiveEvents());
    } catch {
      // Keep whatever was on screen; pull-to-refresh retries.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const classified = classify(events);
  const compact = events.length >= COMPACT_THRESHOLD;
  const open = (id: string) => router.push(`/discover/event/${id}`);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 26 }]}>
        <Text style={styles.title}>Your events</Text>
        {control}
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: tabBarHeight + 16 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
      >
        {events.length === 0 ? (
          <>
            {/* Zero events: tile + one button, then Create. The label appears exactly once on the
                screen; the ground below Create is deliberately empty. */}
            <View style={styles.zeroCard}>
              <View style={styles.zeroTile}>
                <Ionicons name="qr-code" size={32} color={colors.brandMarkCream} />
              </View>
              <Pressable style={styles.zeroButton} onPress={() => setJoinOpen(true)}>
                <Text style={styles.zeroButtonText}>Join an event</Text>
              </Pressable>
            </View>
            <CreateRow compact={false} onPress={() => router.push('/new-event')} />
          </>
        ) : (
          <>
            <Pressable style={[styles.joinCard, compact && styles.joinCardCompact]} onPress={() => setJoinOpen(true)}>
              <View style={[styles.joinTile, compact && styles.joinTileCompact]}>
                <Ionicons name="qr-code" size={compact ? 20 : 23} color={colors.brandMarkCream} />
              </View>
              <View style={styles.joinText}>
                <Text style={compact ? styles.joinTitleCompact : styles.joinTitle}>Join an event</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={colors.mutedInk} />
            </Pressable>
            <CreateRow compact={compact} onPress={() => router.push('/new-event')} />

            <View style={styles.sectionRow}>
              <Text style={styles.eyebrow}>Your events</Text>
              <Text style={styles.eyebrow}>{events.length}</Text>
            </View>

            {classified.map(({ event, live }) =>
              compact ? (
                <Pressable key={event.id} style={[styles.rowCard, live && styles.rowCardLive]} onPress={() => open(event.id)}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {event.name ?? 'Event'}
                    </Text>
                    {whenLine(event) ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {whenLine(event)}
                      </Text>
                    ) : null}
                    {live ? (
                      <View style={styles.pillRow}>
                        <StatusPill live />
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={live ? colors.brandMarkDark : colors.mutedInk} />
                </Pressable>
              ) : (
                <Pressable key={event.id} style={[styles.card, live ? styles.cardLive : styles.cardUpcoming]} onPress={() => open(event.id)}>
                  <View style={styles.cardTop}>
                    <StatusPill live={live} />
                    <Ionicons name="chevron-forward" size={19} color={live ? colors.brandMarkDark : colors.mutedInk} />
                  </View>
                  <Text style={live ? styles.cardNameLive : styles.cardNameUpcoming}>{event.name ?? 'Event'}</Text>
                  {whenLine(event) ? (
                    <View style={styles.metaLine}>
                      <Ionicons name="time" size={15} color={colors.brandInk} />
                      <Text style={styles.meta}>{whenLine(event)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              )
            )}
          </>
        )}
      </ScrollView>

      <JoinEventSheet visible={joinOpen} onClose={() => setJoinOpen(false)} />
    </View>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <View style={live ? styles.pillLive : styles.pillUpcoming}>
      <Text style={live ? styles.pillLiveText : styles.pillUpcomingText}>{live ? 'Happening now' : 'Upcoming'}</Text>
    </View>
  );
}

function CreateRow({ compact, onPress }: { compact: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.createRow, compact && styles.createRowCompact]} onPress={onPress}>
      <Ionicons name="add" size={17} color={colors.brandMarkDark} />
      <Text style={[styles.createText, compact && styles.createTextCompact]}>Create an event</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandMarkCream },
  header: { paddingHorizontal: 18 },
  title: { fontFamily: fonts.wordmark, fontSize: 33, lineHeight: 35, color: colors.brandMarkDark },
  body: { paddingHorizontal: 18, paddingTop: 13, gap: 8 },
  eyebrow: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.brandInk,
  },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 2 },

  joinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 14,
  },
  joinCardCompact: { paddingVertical: 10 },
  joinTile: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.brandMarkDark, alignItems: 'center', justifyContent: 'center' },
  joinTileCompact: { width: 40, height: 40, borderRadius: 12 },
  joinText: { flex: 1, justifyContent: 'center' },
  joinTitle: { fontFamily: fonts.wordmark, fontSize: 21, lineHeight: 25, color: colors.brandMarkDark },
  joinTitleCompact: { fontFamily: fonts.sansSemibold, fontSize: 16.5, color: colors.brandMarkDark },

  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.brandSand,
    borderRadius: 999,
    padding: 13,
    minHeight: 44,
  },
  createRowCompact: { padding: 12 },
  createText: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.brandMarkDark },
  createTextCompact: { fontSize: 14 },

  card: { backgroundColor: colors.card, borderRadius: 18 },
  cardLive: { borderWidth: 1.5, borderColor: colors.brandMarkDark, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  cardUpcoming: { borderWidth: 1, borderColor: colors.hairline, paddingVertical: 13, paddingHorizontal: 16, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardNameLive: { fontFamily: fonts.wordmark, fontSize: 22, lineHeight: 26, color: colors.brandMarkDark },
  cardNameUpcoming: { fontFamily: fonts.wordmark, fontSize: 19, lineHeight: 23, color: colors.brandMarkDark },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.brandInk },

  pillLive: { backgroundColor: colors.brandMarkDark, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  pillLiveText: { fontFamily: fonts.sansSemibold, fontSize: 11.5, letterSpacing: 11.5 * 0.06, textTransform: 'uppercase', color: colors.brandMarkCream },
  pillUpcoming: { borderWidth: 1, borderColor: colors.brandSand, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  pillUpcomingText: { fontFamily: fonts.sansSemibold, fontSize: 11.5, letterSpacing: 11.5 * 0.06, textTransform: 'uppercase', color: colors.brandInk },
  pillRow: { flexDirection: 'row', marginTop: 4 },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowCardLive: { borderWidth: 1.5, borderColor: colors.brandMarkDark },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fonts.wordmark, fontSize: 19, lineHeight: 23, color: colors.brandMarkDark },
  rowMeta: { fontFamily: fonts.sans, fontSize: 13, color: colors.brandInk, marginTop: 2 },

  zeroCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 18,
  },
  zeroTile: { width: 62, height: 62, borderRadius: 18, backgroundColor: colors.brandMarkDark, alignItems: 'center', justifyContent: 'center' },
  zeroButton: { alignSelf: 'stretch', backgroundColor: colors.brandMarkDark, borderRadius: 999, padding: 15, alignItems: 'center' },
  zeroButtonText: { fontFamily: fonts.sansSemibold, fontSize: 15.5, color: colors.brandMarkCream },
});
