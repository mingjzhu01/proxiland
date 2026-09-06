import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedCardV2 } from '../lib/api/feed';
import type { Overlap } from '../lib/api/reveal';
import { ROLE_CATEGORY_LABELS } from '../lib/allowedValues';
import { ReportSheet } from './ReportSheet';
import { Card } from './Card';
import { Chip } from './Chip';
import { WhyYouTwo } from './WhyYouTwo';
import { PrimaryButton, ResolvedButton } from './Buttons';
import { RedactedIdentity } from './RedactedIdentity';
import { colors, typeStyles, fonts } from '../lib/theme';

export function AnonCard({
  card,
  overlap,
  alreadyAsked,
  locked,
  onAskToConnect,
  onLockedTap,
}: {
  card: FeedCardV2;
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
    <Card noPadding style={[styles.card, alreadyAsked && styles.cardAsked]}>
      <View style={styles.identityRow}>
        <RedactedIdentity />
        <Pressable onPress={() => setReportVisible(true)} hitSlop={10} style={styles.flagButton}>
          <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.chipRow}>
          <Chip label={ROLE_CATEGORY_LABELS[card.role_category]} tone="brass" />
          {card.distance_band ? <Chip label={card.distance_band} tone="neutral" /> : null}
        </View>
        <Text style={typeStyles.anonLine}>{card.line}</Text>
      </View>

      {overlap ? <WhyYouTwo reason={overlap.phrase} /> : null}

      <View style={styles.footer}>
        {alreadyAsked ? (
          <ResolvedButton label="Asked · waiting to hear back" />
        ) : (
          <PrimaryButton label="Ask to connect" loading={isAsking} onPress={handleAsk} />
        )}
        <Text style={styles.hint}>They see your name first. You see theirs only if they share back.</Text>
      </View>

      <ReportSheet
        visible={reportVisible}
        targetUserId={card.user_id}
        context="profile"
        onClose={() => setReportVisible(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginVertical: 6 },
  cardAsked: { opacity: 0.72 },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 0 },
  flagButton: { marginLeft: 'auto', padding: 4 },
  body: { padding: 16, paddingBottom: 0, gap: 8 },
  chipRow: { flexDirection: 'row', gap: 6 },
  footer: { padding: 16, gap: 12 },
  hint: { fontFamily: fonts.wordmark, fontSize: 11.5, lineHeight: 16, color: colors.textMuted, textAlign: 'center' },
});
