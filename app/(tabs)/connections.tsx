import { useCallback, useMemo, useState } from 'react';
import { View, FlatList, Text, Pressable, TextInput, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { SectionLabel } from '../../components/SectionLabel';
import { getMyConnections } from '../../lib/api/connections';
import { getUnreadCountsByConnection } from '../../lib/api/messages';
import { colors, avatarSizes, typeStyles, spacing, fonts } from '../../lib/theme';
import type { Connection } from '../../lib/types';

export default function Connections() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [unreadByConnection, setUnreadByConnection] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [conns, unread] = await Promise.all([getMyConnections(), getUnreadCountsByConnection()]);
      setConnections(conns);
      setUnreadByConnection(unread);
    } catch (error: any) {
      Alert.alert('Could not load connections', error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withOther = connections.filter((c) => c.other);
    if (!q) return withOther;
    return withOther.filter((c) => c.other!.full_name.toLowerCase().includes(q));
  }, [connections, search]);

  const unread = filtered.filter((c) => (unreadByConnection.get(c.id) ?? 0) > 0);
  const read = filtered.filter((c) => (unreadByConnection.get(c.id) ?? 0) === 0);

  function renderRow(item: Connection) {
    const other = item.other!;
    const unreadCount = unreadByConnection.get(item.id) ?? 0;
    const isUnread = unreadCount > 0;
    // Preview line: this app doesn't fetch the latest message body per connection today (a
    // real "last message preview" needs a new query, out of scope for a presentation-layer
    // pass) — headline stands in as the subtitle until that exists.
    const preview = other.headline ?? 'Say hi — no messages yet';

    return (
      <Pressable key={item.id} style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
        <Pressable onPress={() => router.push(`/profile/${other.id}`)}>
          <View>
            <LetteredAvatar name={other.full_name} photoUrl={other.photo_url} size={avatarSizes.messageRow} />
            {isUnread ? <View style={styles.unreadRing} /> : null}
          </View>
        </Pressable>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {other.full_name}
            </Text>
          </View>
          <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={1}>
            {isUnread ? `${unreadCount} new · ` : ''}
            {preview}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.brand} />}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
              <Text style={styles.headline}>
                {connections.length > 0
                  ? `${connections.length} ${connections.length === 1 ? 'connection' : 'connections'}`
                  : 'No connections yet'}
              </Text>
              <View style={styles.searchField}>
                <Ionicons name="search" size={15} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search name"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
            </View>

            {filtered.length === 0 && !isLoading ? <Text style={styles.empty}>No connections yet.</Text> : null}

            {unread.length > 0 ? (
              <>
                <SectionLabel tone="brass" style={styles.groupLabel}>Unread</SectionLabel>
                {unread.map(renderRow)}
              </>
            ) : null}
            {read.length > 0 ? (
              <>
                <SectionLabel style={styles.groupLabel}>Earlier</SectionLabel>
                {read.map(renderRow)}
              </>
            ) : null}
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: spacing.gutter, paddingTop: 14, paddingBottom: 8 },
  headline: { ...typeStyles.screenHeadline, marginTop: 8, marginBottom: 14 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchInput: { fontFamily: fonts.wordmark, flex: 1, fontSize: 14, color: colors.ink },
  groupLabel: { marginHorizontal: spacing.gutter, marginTop: 18, marginBottom: 8 },
  empty: { fontFamily: fonts.wordmark, padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.ruleInner,
  },
  unreadRing: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.brass,
    borderWidth: 2,
    borderColor: colors.paper,
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontFamily: fonts.wordmark, fontSize: 16, color: colors.ink },
  preview: { fontFamily: fonts.wordmark, fontSize: 13.5, color: colors.textTertiary },
  previewUnread: { color: colors.ink },
});
