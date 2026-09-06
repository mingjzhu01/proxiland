import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../lib/theme';

// The anon-card treatment: a redacted portrait, two redacted text bars, and a HIDDEN label.
// Communicates concealment explicitly rather than reading as a loading skeleton.
//
// The portrait's "blurred" look and the name bar's diagonal stripe are both approximated
// with plain Views (overlapping soft circles; alternating rotated bars) rather than
// expo-blur or an SVG stripe asset — avoids adding a new native dependency (which would
// force another EAS build cycle) for a decorative-only effect. Revisit with expo-blur /
// a static stripe asset if the approximation doesn't read well on device.
export function RedactedIdentity() {
  return (
    <View style={styles.row}>
      <View style={styles.portrait}>
        <View style={styles.blobA} />
        <View style={styles.blobB} />
      </View>
      <View style={styles.bars}>
        <StripedBar />
        <View style={styles.secondaryBar} />
      </View>
      <Text style={styles.hidden}>HIDDEN</Text>
    </View>
  );
}

function StripedBar() {
  const barWidth = 118;
  const stripeWidth = 12;
  const count = Math.ceil(barWidth / stripeWidth) + 4;
  return (
    <View style={styles.nameBar}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stripe,
            { left: i * stripeWidth - 20, backgroundColor: i % 2 === 0 ? '#241C16' : '#3A2F26' },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  portrait: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.ruleInner,
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: 'hidden',
  },
  blobA: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#B9A88F',
    opacity: 0.55,
    top: 6,
    left: 2,
  },
  blobB: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#8F7C64',
    opacity: 0.5,
    bottom: 2,
    right: 2,
  },
  bars: { gap: 6 },
  nameBar: { width: 118, height: 11, borderRadius: 3, overflow: 'hidden' },
  stripe: { position: 'absolute', top: -6, width: 8, height: 30, transform: [{ rotate: '25deg' }] },
  secondaryBar: { width: 74, height: 9, borderRadius: 3, backgroundColor: colors.redactBarSub },
  hidden: {
    marginLeft: 'auto',
    fontFamily: fonts.wordmark,
    fontSize: 9.5,
    letterSpacing: 1,
    color: colors.textMuted,
  },
});
