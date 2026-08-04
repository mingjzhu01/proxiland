import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedCard } from '../lib/api/feed';
import { ROLE_CATEGORY_LABELS } from '../lib/allowedValues';

export function AnonCard({
  card,
  alreadyAsked,
  onExpand,
  onLoadBio,
  onAskToConnect,
}: {
  card: FeedCard;
  alreadyAsked: boolean;
  onExpand: () => Promise<string | null>;
  onLoadBio: () => Promise<string>;
  onAskToConnect: (connectionLine: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  // Deliberately NOT seeded from card.overlap_phrase — that comes from a plain LEFT JOIN in
  // individual_cards_for_scope with no freshness check, so it can be stale. onExpand() calls
  // the phrase-overlap function directly, which does its own fingerprint-based freshness
  // check — always go through that instead of trusting whatever the feed query cached.
  const [overlapPhrase, setOverlapPhrase] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  async function handleExpandPress() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setIsLoading(true);
    try {
      const [phrase, longBio] = await Promise.all([onExpand(), onLoadBio()]);
      setOverlapPhrase(phrase);
      setBio(longBio);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAsk() {
    setIsAsking(true);
    try {
      await onAskToConnect(overlapPhrase ?? "You're both active in this area right now.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={20} color="#999" />
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{ROLE_CATEGORY_LABELS[card.role_category]}</Text>
        </View>
      </View>

      <Text style={styles.line}>{card.line}</Text>
      {card.distance_band ? <Text style={styles.distance}>{card.distance_band}</Text> : null}

      {!expanded ? (
        <View style={styles.buttonRow}>
          <Pressable style={styles.outlineButton} onPress={handleExpandPress}>
            <Text style={styles.outlineButtonText}>Expand</Text>
          </Pressable>
          {alreadyAsked ? (
            <View style={[styles.outlineButton, styles.askedPill]}>
              <Text style={styles.askedPillText}>Asked</Text>
            </View>
          ) : (
            <Pressable style={styles.askButton} onPress={handleAsk} disabled={isAsking}>
              <Text style={styles.askButtonText}>{isAsking ? 'Sending…' : 'Ask to connect'}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <Pressable style={[styles.outlineButton, styles.collapseButton]} onPress={handleExpandPress}>
            <Text style={styles.outlineButtonText}>Collapse</Text>
          </Pressable>

          <View style={styles.divider} />

          {isLoading ? (
            <ActivityIndicator size="small" style={styles.loadingSpinner} />
          ) : (
            <>
              {bio ? <Text style={styles.bio}>{bio}</Text> : null}

              {overlapPhrase ? (
                <View style={styles.whyBox}>
                  <View style={styles.whyLabelRow}>
                    <Ionicons name="sparkles" size={13} color="#3b5bdb" />
                    <Text style={styles.whyLabel}>WHY YOU TWO</Text>
                  </View>
                  <Text style={styles.whyText}>{overlapPhrase}</Text>
                </View>
              ) : null}

              <Text style={styles.hint}>
                They'll see your name first. You'll see theirs only if they share back.
              </Text>

              {alreadyAsked ? (
                <Text style={styles.asked}>Asked — waiting to hear back</Text>
              ) : (
                <Pressable
                  style={[styles.askButtonFull, isAsking && styles.askButtonDisabled]}
                  onPress={handleAsk}
                  disabled={isAsking}
                >
                  <Text style={styles.askButtonText}>{isAsking ? 'Sending…' : 'Ask to connect'}</Text>
                </Pressable>
              )}
            </>
          )}
        </>
      )}
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
  cardExpanded: { borderColor: '#3b5bdb' },
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
  line: { fontSize: 17, color: '#111', fontWeight: '600', marginBottom: 4 },
  distance: { fontSize: 12, color: '#888', marginBottom: 12 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  outlineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  outlineButtonText: { fontSize: 14, fontWeight: '600', color: '#111' },
  collapseButton: { flex: 0, alignSelf: 'flex-start', paddingHorizontal: 20, backgroundColor: '#f5f5f5' },
  askButton: { flex: 1, backgroundColor: '#111', borderRadius: 20, paddingVertical: 10, alignItems: 'center' },
  askButtonFull: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  askButtonDisabled: { opacity: 0.5 },
  askButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  askedPill: { backgroundColor: '#f5f5f5' },
  askedPillText: { fontSize: 13, color: '#999', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  loadingSpinner: { marginVertical: 12 },
  bio: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 14 },
  whyBox: { backgroundColor: '#eef1fd', borderRadius: 10, padding: 12, marginBottom: 14 },
  whyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  whyLabel: { fontSize: 11, fontWeight: '700', color: '#3b5bdb', letterSpacing: 0.5 },
  whyText: { fontSize: 13, color: '#3b5bdb', lineHeight: 18 },
  hint: { fontSize: 12, color: '#999', marginBottom: 12 },
  asked: { fontSize: 13, color: '#999', textAlign: 'center' },
});
