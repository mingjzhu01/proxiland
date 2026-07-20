import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { getMyProfile, upsertMyProfile, uploadProfilePhoto } from '../../lib/api/profile';
import type { GradDegreeType, Profile } from '../../lib/types';

const GRAD_DEGREE_OPTIONS: GradDegreeType[] = ['Masters', 'MBA', 'PhD'];

const emptyProfile: Omit<Profile, 'id' | 'created_at'> = {
  full_name: '',
  headline: '',
  employer: '',
  title: '',
  undergrad_school: '',
  undergrad_year: '',
  grad_degree_type: null,
  grad_school: '',
  grad_year: '',
  photo_url: '',
  bio: '',
};

export default function MyProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Omit<Profile, 'id' | 'created_at'>>(emptyProfile);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await getMyProfile();
    if (data) {
      setUserId(data.id);
      setProfile(data);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePickPhoto() {
    if (!userId) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    try {
      const url = await uploadProfilePhoto(userId, result.assets[0].uri);
      setProfile((p) => ({ ...p, photo_url: url }));
      await upsertMyProfile({ photo_url: url });
    } catch (error: any) {
      Alert.alert('Upload failed', error.message);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await upsertMyProfile(profile);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (error: any) {
      Alert.alert('Save failed', error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function toggleGradDegreeType(type: GradDegreeType) {
    setProfile((p) => ({
      ...p,
      grad_degree_type: p.grad_degree_type === type ? null : type,
    }));
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.avatarWrap} onPress={handlePickPhoto}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>Add photo</Text>
            </View>
          )}
        </Pressable>

        <Field label="Full name" value={profile.full_name} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} />
        <Field label="Headline" value={profile.headline ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, headline: v }))} />
        <Field label="Employer" value={profile.employer ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, employer: v }))} />
        <Field label="Title" value={profile.title ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, title: v }))} />

        <Text style={styles.sectionLabel}>Undergrad</Text>
        <View style={styles.row}>
          <Field
            label="School"
            value={profile.undergrad_school ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, undergrad_school: v }))}
            containerStyle={styles.rowFieldWide}
          />
          <Field
            label="Year"
            value={profile.undergrad_year ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, undergrad_year: v }))}
            keyboardType="number-pad"
            containerStyle={styles.rowFieldNarrow}
          />
        </View>

        <Text style={styles.sectionLabel}>Advanced degree</Text>
        <View style={styles.chipRow}>
          {GRAD_DEGREE_OPTIONS.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, profile.grad_degree_type === type && styles.chipSelected]}
              onPress={() => toggleGradDegreeType(type)}
            >
              <Text
                style={[
                  styles.chipText,
                  profile.grad_degree_type === type && styles.chipTextSelected,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        {profile.grad_degree_type ? (
          <View style={styles.row}>
            <Field
              label="School"
              value={profile.grad_school ?? ''}
              onChangeText={(v) => setProfile((p) => ({ ...p, grad_school: v }))}
              containerStyle={styles.rowFieldWide}
            />
            <Field
              label="Year"
              value={profile.grad_year ?? ''}
              onChangeText={(v) => setProfile((p) => ({ ...p, grad_year: v }))}
              keyboardType="number-pad"
              containerStyle={styles.rowFieldNarrow}
            />
          </View>
        ) : null}

        <Field label="Bio" value={profile.bio ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, bio: v }))} multiline />

        <Pressable style={[styles.button, isSaving && styles.buttonDisabled]} onPress={handleSave} disabled={isSaving}>
          <Text style={styles.buttonText}>{isSaving ? 'Saving…' : 'Save profile'}</Text>
        </Pressable>

        <Pressable style={styles.blockedLink} onPress={() => router.push('/blocked-users')}>
          <Text style={styles.blockedLinkText}>Blocked users</Text>
        </Pressable>

        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  containerStyle,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
  containerStyle?: object;
}) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60, gap: 4 },
  avatarWrap: { alignSelf: 'center', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#888', fontSize: 12 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15 },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  rowFieldWide: { flex: 2 },
  rowFieldNarrow: { flex: 1 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipSelected: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  chipTextSelected: { color: '#fff' },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  blockedLink: { alignItems: 'center', marginTop: 24 },
  blockedLinkText: { color: '#666', fontSize: 14 },
  signOutButton: { alignItems: 'center', marginTop: 12 },
  signOutText: { color: '#cc3333', fontSize: 14 },
});
