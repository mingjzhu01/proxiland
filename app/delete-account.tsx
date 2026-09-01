import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { deleteAccount } from '../lib/api/account';

export default function DeleteAccount() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteAccount();
      Alert.alert('Account deleted', 'Your account and all your data have been permanently deleted.', [
        {
          text: 'OK',
          onPress: async () => {
            // The account (and its token) no longer exists server-side at this point — a
            // normal signOut() calls the server to invalidate the session and can throw on a
            // token for a user that's already gone. { scope: 'local' } only clears the
            // on-device session, which is all that's needed here.
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch {
              // Already-deleted account — nothing more to clean up server-side either way.
            }
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Could not delete account',
        error.message ?? 'Something went wrong. You can try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delete your account</Text>
      <Text style={styles.warning}>
        This permanently removes your profile, photos, connections, and chats. This cannot be
        undone.
      </Text>

      <Text style={styles.label}>Type DELETE to confirm</Text>
      <TextInput
        style={styles.input}
        value={confirmText}
        onChangeText={setConfirmText}
        placeholder="DELETE"
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Pressable
        style={[styles.deleteButton, (!canDelete || isDeleting) && styles.buttonDisabled]}
        onPress={handleDelete}
        disabled={!canDelete || isDeleting}
      >
        {isDeleting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.deleteButtonText}>Permanently delete my account</Text>
        )}
      </Pressable>

      <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={isDeleting}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 12, marginBottom: 12 },
  warning: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 24,
  },
  deleteButton: {
    backgroundColor: '#cc3333',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
  cancelButton: { paddingVertical: 16, alignItems: 'center' },
  cancelButtonText: { color: '#666', fontSize: 15, fontWeight: '600' },
});
