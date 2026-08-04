import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getProfile } from '../../lib/api/profile';
import { sendRequest } from '../../lib/api/requests';
import { blockUser, reportUser, getConnectionWith } from '../../lib/api/connections';
import { formatEducation } from '../../lib/formatEducation';
import type { Profile } from '../../lib/types';

export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [coffeeModalVisible, setCoffeeModalVisible] = useState(false);
  const [coffeeMessage, setCoffeeMessage] = useState('');
  const [coffeeLocation, setCoffeeLocation] = useState('');
  const [coffeeDate, setCoffeeDate] = useState(new Date());
  const [coffeeTime, setCoffeeTime] = useState(new Date());

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setHasLoaded(false);
      getProfile(id).then((p) => {
        setProfile(p);
        setHasLoaded(true);
      });
      getConnectionWith(id).then(setConnectionId);
    }, [id])
  );

  async function handleConnect() {
    if (!id) return;
    setIsSending(true);
    try {
      await sendRequest(id, 'connect');
      Alert.alert('Sent', 'Connection request sent.');
    } catch (error: any) {
      Alert.alert('Could not send request', error.message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendCoffee() {
    if (!id) return;
    const meetingAt = new Date(coffeeDate);
    meetingAt.setHours(coffeeTime.getHours(), coffeeTime.getMinutes(), 0, 0);

    setIsSending(true);
    try {
      await sendRequest(id, 'coffee', {
        message: coffeeMessage.trim() || undefined,
        meetingLocation: coffeeLocation.trim() || undefined,
        meetingAt,
      });
      setCoffeeModalVisible(false);
      setCoffeeMessage('');
      setCoffeeLocation('');
      Alert.alert('Sent', 'Coffee request sent.');
    } catch (error: any) {
      Alert.alert('Could not send request', error.message);
    } finally {
      setIsSending(false);
    }
  }

  function handleBlockOrReport() {
    if (!id) return;
    Alert.alert('Block or Report', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          await blockUser(id);
          router.back();
        },
      },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          await reportUser(id, 'reported from profile view');
          Alert.alert('Reported', 'Thanks — our team will review this.');
        },
      },
    ]);
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text>{hasLoaded ? "This profile isn't available right now." : 'Loading…'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {profile.photo_url ? (
        <Image source={{ uri: profile.photo_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{profile.full_name.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.name}>{profile.full_name}</Text>
      {profile.linkedin_verified ? (
        <Text style={styles.verifiedBadge}>✓ LinkedIn Verified</Text>
      ) : null}
      {profile.linkedin_url ? (
        <Pressable onPress={() => Linking.openURL(profile.linkedin_url!)}>
          <Text style={styles.linkedinLink}>View LinkedIn profile</Text>
        </Pressable>
      ) : null}
      {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}
      {(profile.title || profile.employer) ? (
        <Text style={styles.subtitle}>
          {[profile.title, profile.employer].filter(Boolean).join(' at ')}
        </Text>
      ) : null}
      {formatEducation(profile) ? (
        <Text style={styles.subtitle}>{formatEducation(profile)}</Text>
      ) : null}
      {profile.bio ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.bio}>{profile.bio}</Text>
        </>
      ) : null}

      {connectionId ? (
        <>
          <Pressable
            style={styles.button}
            onPress={() => router.push(`/chat/${connectionId}`)}
          >
            <Text style={styles.buttonText}>💬 Message</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.coffeeButton, isSending && styles.buttonDisabled]}
            onPress={() => setCoffeeModalVisible(true)}
            disabled={isSending}
          >
            <Text style={styles.buttonText}>☕ Ask for coffee</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            style={[styles.button, isSending && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={isSending}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </Pressable>
          <Text style={styles.coffeeHint}>Connect first to schedule a coffee chat</Text>
        </>
      )}

      <Pressable style={styles.reportLink} onPress={handleBlockOrReport}>
        <Text style={styles.reportLinkText}>Block or Report</Text>
      </Pressable>

      <Modal visible={coffeeModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ask {profile.full_name.split(' ')[0]} for coffee</Text>

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Free to grab coffee?"
              value={coffeeMessage}
              onChangeText={setCoffeeMessage}
            />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Blue Bottle on Market St"
              value={coffeeLocation}
              onChangeText={setCoffeeLocation}
            />

            <Text style={styles.fieldLabel}>Date</Text>
            <DateTimePicker
              value={coffeeDate}
              mode="date"
              display="compact"
              minimumDate={new Date()}
              onChange={(_, date) => date && setCoffeeDate(date)}
            />

            <Text style={styles.fieldLabel}>Time</Text>
            <DateTimePicker
              value={coffeeTime}
              mode="time"
              display="compact"
              onChange={(_, time) => time && setCoffeeTime(time)}
            />

            <Pressable
              style={[styles.button, styles.coffeeButton, isSending && styles.buttonDisabled]}
              onPress={handleSendCoffee}
              disabled={isSending}
            >
              <Text style={styles.buttonText}>{isSending ? 'Sending…' : 'Send coffee request'}</Text>
            </Pressable>

            <Pressable style={styles.cancelLink} onPress={() => setCoffeeModalVisible(false)}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, alignItems: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  avatarPlaceholder: { backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 40, fontWeight: '700', color: '#555' },
  name: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 15, color: '#555', marginTop: 4, textAlign: 'center' },
  verifiedBadge: { color: '#0A66C2', fontWeight: '700', fontSize: 13, marginTop: 6 },
  linkedinLink: { color: '#0A66C2', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
  subtitle: { fontSize: 14, color: '#333', marginTop: 4 },
  divider: { width: '100%', height: 1, backgroundColor: '#eee', marginTop: 20 },
  bio: { fontSize: 14, color: '#444', marginTop: 16, textAlign: 'center' },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  coffeeButton: { backgroundColor: '#a05a2c' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  coffeeHint: { color: '#999', fontSize: 12, marginTop: 8, textAlign: 'center' },
  reportLink: { marginTop: 24 },
  reportLinkText: { color: '#999', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15 },
  cancelLink: { alignItems: 'center', marginTop: 14 },
  cancelLinkText: { color: '#666', fontSize: 14 },
});
