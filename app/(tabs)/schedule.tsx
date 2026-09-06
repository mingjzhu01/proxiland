import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Alert, Linking } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getScheduledCoffees, hideRequestForMe } from '../../lib/api/requests';
import { supabase } from '../../lib/supabase';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { SectionLabel } from '../../components/SectionLabel';
import { SecondaryButton } from '../../components/Buttons';
import { colors, typeStyles, spacing, radii, fonts } from '../../lib/theme';
import type { ConnectionRequest } from '../../lib/types';

function dayLabel(meetingAt: string | null): { key: string; label: string; isNear: boolean } {
  if (!meetingAt) return { key: 'unscheduled', label: 'Unscheduled', isNear: false };
  const date = new Date(meetingAt);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return { key: 'today', label: 'Today', isNear: true };
  if (diffDays === 1) return { key: 'tomorrow', label: 'Tomorrow', isNear: true };
  return { key: date.toDateString(), label: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), isNear: false };
}

function formatTime(meetingAt: string | null): { number: string; period: string } {
  if (!meetingAt) return { number: '--', period: '' };
  const d = new Date(meetingAt);
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return { number: `${hours12}:${minutes}`, period: hours24 < 12 ? 'AM' : 'PM' };
}

export default function Schedule() {
  const router = useRouter();
  const [coffees, setCoffees] = useState<ConnectionRequest[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      setMyId(userData.user?.id ?? null);
      setCoffees(await getScheduledCoffees());
    } catch (error: any) {
      Alert.alert('Could not load schedule', error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDelete(id: string) {
    try {
      await hideRequestForMe(id);
      setCoffees((list) => list.filter((c) => c.id !== id));
    } catch (error: any) {
      Alert.alert('Could not delete', error.message);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; isNear: boolean; items: ConnectionRequest[] }>();
    for (const item of coffees) {
      const { key, label, isNear } = dayLabel(item.meeting_at);
      if (!map.has(key)) map.set(key, { label, isNear, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  }, [coffees]);

  const nextUpId = coffees[0]?.id;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.brand} />}
    >
      <View style={styles.header}>
        <SectionLabel tone="brass">Schedule</SectionLabel>
        <Text style={styles.headline}>
          {coffees.length > 0
            ? `${coffees.length} ${coffees.length === 1 ? 'coffee' : 'coffees'} this week`
            : 'Nothing scheduled yet'}
        </Text>
      </View>

      {coffees.length === 0 ? (
        <Text style={styles.empty}>No coffee chats scheduled yet.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.label}>
            <SectionLabel tone={group.isNear ? 'brass' : 'muted'} style={styles.groupLabel}>
              {group.label}
            </SectionLabel>
            {group.items.map((item) => {
              const other = item.sender_id === myId ? item.receiver : item.sender;
              const time = formatTime(item.meeting_at);
              const isNext = item.id === nextUpId;
              return (
                <SwipeToDelete key={item.id} onDelete={() => handleDelete(item.id)}>
                  <View style={styles.card}>
                    <Pressable style={styles.cardRow} onPress={() => other && router.push(`/profile/${other.id}`)}>
                      <View style={styles.timeColumn}>
                        <Text style={styles.timeNumber}>{time.number}</Text>
                        <Text style={styles.timePeriod}>{time.period}</Text>
                      </View>
                      <View style={styles.timeDivider} />
                      <View style={styles.info}>
                        <Text style={typeStyles.cardName}>{other?.full_name ?? 'Someone'}</Text>
                        {item.meeting_location ? <Text style={styles.venue}>{item.meeting_location}</Text> : null}
                        {item.message ? <Text style={styles.note}>"{item.message}"</Text> : null}
                      </View>
                    </Pressable>
                    {isNext ? (
                      <View style={styles.nextUpFooter}>
                        <View style={styles.flex1}>
                          <SecondaryButton label="Message" onPress={() => other && router.push(`/profile/${other.id}`)} />
                        </View>
                        <View style={styles.flex1}>
                          <SecondaryButton
                            label="Directions"
                            onPress={() => {
                              if (item.meeting_location) {
                                Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(item.meeting_location)}`);
                              }
                            }}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                </SwipeToDelete>
              );
            })}
          </View>
        ))
      )}

      {coffees.length > 0 ? <Text style={styles.hint}>Swipe a card left to remove it</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: spacing.gutter, paddingTop: 14, paddingBottom: 8 },
  headline: { ...typeStyles.screenHeadline, marginTop: 8 },
  empty: { padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 14 },
  groupLabel: { marginHorizontal: spacing.gutter, marginTop: 20, marginBottom: 8 },
  card: {
    marginHorizontal: spacing.gutter,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  timeColumn: { width: 54, alignItems: 'center' },
  timeNumber: { fontFamily: fonts.wordmark, fontSize: 25, color: colors.ink },
  timePeriod: { fontFamily: fonts.wordmark, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  timeDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.ruleInner, marginHorizontal: 14 },
  info: { flex: 1, gap: 3 },
  venue: { fontSize: 13, color: colors.textTertiary },
  note: { fontSize: 13.5, color: colors.ink, fontStyle: 'italic' },
  nextUpFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderColor: colors.ruleInner,
  },
  flex1: { flex: 1 },
  hint: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 20 },
});
