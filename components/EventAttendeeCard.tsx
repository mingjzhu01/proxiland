import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ProfileCard } from './ProfileCard';
import type { EventAttendee } from '../lib/api/events';

type ConnectStatus = 'none' | 'requested' | 'connected';

type Props = {
  attendee: EventAttendee;
  status: ConnectStatus;
  onPress: () => void;
  onConnect: () => void;
  reason?: string | null;
};

export function EventAttendeeCard({ attendee, status, onPress, onConnect, reason }: Props) {
  return (
    <View style={styles.wrap}>
      <ProfileCard
        name={attendee.full_name}
        headline={attendee.headline}
        employer={attendee.employer}
        title={attendee.title}
        undergradSchool={attendee.undergrad_school}
        undergradYear={attendee.undergrad_year}
        gradSchool={attendee.grad_school}
        gradYear={attendee.grad_year}
        photoUrl={attendee.photo_url}
        onPress={onPress}
      />
      {reason ? <Text style={styles.reason}>{reason}</Text> : null}
      <View style={styles.actionRow}>
        {status === 'connected' ? (
          <View style={[styles.pill, styles.connectedPill]}>
            <Text style={styles.connectedPillText}>Connected</Text>
          </View>
        ) : status === 'requested' ? (
          <View style={[styles.pill, styles.requestedPill]}>
            <Text style={styles.requestedPillText}>Requested</Text>
          </View>
        ) : (
          <Pressable style={[styles.pill, styles.connectPill]} onPress={onConnect}>
            <Text style={styles.connectPillText}>Connect</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 4, borderBottomWidth: 1, borderColor: '#eee' },
  reason: {
    fontSize: 12,
    color: '#3b5bdb',
    fontStyle: 'italic',
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  actionRow: { paddingHorizontal: 16, paddingVertical: 8, alignItems: 'flex-start' },
  pill: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  connectPill: { backgroundColor: '#4A3B31' },
  connectPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  requestedPill: { backgroundColor: '#f0f0f0' },
  requestedPillText: { color: '#888', fontSize: 13, fontWeight: '600' },
  connectedPill: { backgroundColor: '#e6f4ea' },
  connectedPillText: { color: '#2d7a45', fontSize: 13, fontWeight: '700' },
});
