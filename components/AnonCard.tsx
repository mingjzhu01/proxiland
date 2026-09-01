import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedCard } from '../lib/api/feed';
import type { Overlap } from '../lib/api/reveal';
import { ROLE_CATEGORY_LABELS } from '../lib/allowedValues';
import { ReportSheet } from './ReportSheet';

export function AnonCard({
  card,
  overlap,
  alreadyAsked,
  locked,
  onAskToConnect,
  onLockedTap,
}: {
  card: FeedCard;
  // Pre-fetched by the parent (nearby.tsx) for every visible stranger, up front — that's also
  // what drives the feed's sort order, so it has to be known before the card ever renders.
  overlap: Overlap;
  alreadyAsked: boolean;
  // True for a signed-in user who hasn't completed their own profile yet — they can still
  // browse the feed, but asking to connect needs a real profile behind it (a reveal request
  // needs a real identity to hand over). onLockedTap fires instead of the real action.
  locked: boolean;
  onAskToConnect: (connectionLine: string) => Promise<void>;
  onLockedTap: () => void;
}) {
  const [isAsking, setIsAsking] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  async function handleAsk() {
    if (locked) {
      onLockedTap();
      return;
    }
    setIsAsking(true);
    try {
      await onAskToConnect(overlap?.phrase ?? "You're both active in this area right now.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={20} color="#999" />
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{ROLE_CATEGORY_LABELS[card.role_category]}</Text>
        </View>
        <View style={styles.spacer} />
        <Pressable onPress={() => setReportVisible(true)} hitSlop={10} style={styles.flagButton}>
          <Ionicons name="flag-outline" size={16} color="#aaa" />
        </Pressable>
      </View>

      <Text style={styles.line}>{card.line}</Text>
      {card.distance_band ? <Text style={styles.distance}>{card.distance_band}</Text> : null}

      {overlap ? (
        <View style={styles.whyBox}>
          <View style={styles.whyLabelRow}>
            <Ionicons name="sparkles" size={13} color="#3b5bdb" />
            <Text style={styles.whyLabel}>WHY YOU TWO</Text>
          </View>
          <Text style={styles.whyText}>{overlap.phrase}</Text>
        </View>
      ) : null}

      <Text style={styles.hint}>They'll see your name first. You'll see theirs only if they share back.</Text>

      {alreadyAsked ? (
        <View style={styles.askedPill}>
          <Text style={styles.askedPillText}>Asked — waiting to hear back</Text>
        </View>
      ) : (
        <Pressable
          style={[styles.askButtonFull, isAsking && styles.askButtonDisabled]}
          onPress={handleAsk}
          disabled={isAsking}
        >
          <Text style={styles.askButtonText}>{isAsking ? 'Sending…' : 'Ask to connect'}</Text>
        </Pressable>
      )}

      <ReportSheet
        visible={reportVisible}
        targetUserId={card.user_id}
        context="profile"
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, color: '#555', fontWeight: '600' },
  spacer: { flex: 1 },
  flagButton: { padding: 4 },
  line: { fontSize: 17, color: '#111', fontWeight: '600', marginBottom: 4, flexShrink: 1, flexWrap: 'wrap', width: '100%' },
  distance: { fontSize: 12, color: '#888', marginBottom: 12 },
  askButtonFull: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 12, alignItems: 'center' },
  askButtonDisabled: { opacity: 0.5 },
  askButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  askedPill: { backgroundColor: '#f5f5f5', borderRadius: 20, paddingVertical: 12, alignItems: 'center' },
  askedPillText: { fontSize: 13, color: '#999', fontWeight: '600' },
  whyBox: { backgroundColor: '#eef1fd', borderRadius: 10, padding: 12, marginBottom: 12 },
  whyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  whyLabel: { fontSize: 11, fontWeight: '700', color: '#3b5bdb', letterSpacing: 0.5 },
  whyText: { fontSize: 13, color: '#3b5bdb', lineHeight: 18 },
  hint: { fontSize: 12, color: '#999', marginBottom: 12 },
});
