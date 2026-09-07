import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { getMyOrganizedEvents, type OrganizedEvent } from '../../lib/api/organizer';
import { SectionLabel } from '../../components/SectionLabel';
import { colors, spacing, typeStyles, fonts, radii } from '../../lib/theme';

const STATUS_LABEL: Record<OrganizedEvent['status'], string> = {
  draft: 'Draft',
  active: 'Live',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

export default function OrganizerHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<OrganizedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setEvents(await getMyOrganizedEvents());
    } catch (error: any) {
      Alert.alert('Could not load events', error.message ?? String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notAuthorizedText}>You don't have organiser access.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={isLoading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <View style={styles.topRow}>
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>
            <Text style={styles.headline}>Your events</Text>
            <Pressable style={styles.newButton} onPress={() => router.push('/organizer/new')}>
              <Ionicons name="add" size={18} color={colors.inkOn} />
              <Text style={styles.newButtonText}>New event</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No events yet — tap "New event" to create your first one.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/organizer/${item.id}/manage`)}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{item.name || 'Untitled event'}</Text>
              {item.venue_name ? <Text style={styles.rowVenue}>{item.venue_name}</Text> : null}
            </View>
            <SectionLabel tone={item.status === 'active' ? 'brass' : 'muted'}>{STATUS_LABEL[item.status]}</SectionLabel>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  notAuthorizedText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textTertiary, textAlign: 'center' },
  content: { paddingBottom: 60 },
  header: { paddingHorizontal: spacing.gutter, paddingBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headline: { ...typeStyles.screenHeadline, marginBottom: 14 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radii.button,
    paddingVertical: 12,
  },
  newButtonText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.inkOn },
  emptyCard: { marginHorizontal: spacing.gutter, marginTop: 14, borderWidth: 1, borderColor: colors.rule, borderRadius: radii.card, padding: 16 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textTertiary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.ruleInner,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
  rowVenue: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textSecondary },
});
