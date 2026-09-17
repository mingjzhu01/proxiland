// The one action control for a person, per the event-connections handoff's state table. The
// same component renders in the event tabs, the event connections sheet, the global
// Connections screen and the profile, so a state looks identical everywhere.
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../lib/theme';
import type { RelationshipStatus } from '../lib/relationships';

type Props = {
  status: RelationshipStatus;
  busy?: boolean;
  onConnect: () => void;
  onAccept: () => void;
  onMessage: () => void;
};

export function RelationshipPill({ status, busy, onConnect, onAccept, onMessage }: Props) {
  switch (status.kind) {
    case 'self':
      return <Text style={styles.you}>You</Text>;
    case 'connected':
      return (
        <Pressable style={styles.message} onPress={onMessage} hitSlop={6} disabled={busy}>
          <Text style={styles.messageText}>Message</Text>
        </Pressable>
      );
    case 'incoming':
      return (
        <Pressable style={[styles.fill, styles.accept]} onPress={onAccept} hitSlop={6} disabled={busy}>
          <Text style={styles.fillText}>{busy ? 'Accepting…' : 'Accept'}</Text>
        </Pressable>
      );
    case 'outgoing':
      return (
        <Pressable style={styles.requested} disabled accessibilityLabel="Request sent">
          <Text style={styles.requestedText}>Requested</Text>
        </Pressable>
      );
    default:
      return (
        <Pressable style={[styles.fill, styles.connect]} onPress={onConnect} hitSlop={6} disabled={busy}>
          <Text style={styles.fillText}>{busy ? 'Sending…' : 'Connect'}</Text>
        </Pressable>
      );
  }
}

const styles = StyleSheet.create({
  fill: {
    backgroundColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 13,
    minHeight: 44,
    justifyContent: 'center',
  },
  connect: { paddingHorizontal: 17 },
  accept: { paddingHorizontal: 19 },
  fillText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.brandMarkCream },
  requested: {
    backgroundColor: colors.brandMarkCream,
    borderWidth: 1,
    borderColor: colors.brandSand,
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 15,
    minHeight: 44,
    justifyContent: 'center',
  },
  requestedText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.brandInk },
  message: {
    borderWidth: 1.5,
    borderColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  messageText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.brandMarkDark },
  you: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12.5,
    letterSpacing: 12.5 * 0.1,
    textTransform: 'uppercase',
    color: colors.brandInk,
    paddingRight: 4,
  },
});
