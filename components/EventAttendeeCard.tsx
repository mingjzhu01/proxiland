// Attendee row for the event's Top Matches / Overlap / Everyone tabs, per the event-connections
// handoff §3: avatar, name / role / company, one relationship-state pill. The match rationale
// ("why you two") stays for ranked tabs — it's the matching logic's output, which the handoff
// says not to touch — rendered under the row inside the same card.
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LetteredAvatar } from './LetteredAvatar';
import { RelationshipPill } from './RelationshipPill';
import { WhyYouTwo } from './WhyYouTwo';
import { colors, fonts } from '../lib/theme';
import type { EventAttendee } from '../lib/api/events';
import type { RelationshipStatus } from '../lib/relationships';

type Props = {
  attendee: EventAttendee;
  status: RelationshipStatus;
  busy?: boolean;
  onPress: () => void;
  onConnect: () => void;
  onAccept: () => void;
  onMessage: () => void;
  reason?: string | null;
};

export function EventAttendeeCard({ attendee, status, busy, onPress, onConnect, onAccept, onMessage, reason }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable onPress={onPress}>
          <LetteredAvatar name={attendee.full_name} photoUrl={attendee.photo_url} size={48} />
        </Pressable>
        <Pressable style={styles.text} onPress={onPress}>
          <Text style={styles.name} numberOfLines={1}>{attendee.full_name}</Text>
          {attendee.title ? <Text style={styles.role} numberOfLines={1}>{attendee.title}</Text> : null}
          {attendee.employer ? <Text style={styles.company} numberOfLines={1}>{attendee.employer}</Text> : null}
        </Pressable>
        <RelationshipPill status={status} busy={busy} onConnect={onConnect} onAccept={onAccept} onMessage={onMessage} />
      </View>
      {reason ? (
        <View style={styles.reason}>
          <WhyYouTwo reason={reason} dense />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sansSemibold, fontSize: 16.5, lineHeight: 20, color: colors.brandMarkDark },
  role: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 18, color: colors.brandInk, marginTop: 3 },
  company: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 17.5, color: colors.brandInk },
  reason: { marginTop: 10 },
});
