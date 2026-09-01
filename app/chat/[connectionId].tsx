import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { getMessages, sendMessage, subscribeToMessages, markConnectionRead, type Message } from '../../lib/api/messages';
import { getMyConnections, blockUser } from '../../lib/api/connections';
import { supabase } from '../../lib/supabase';
import { useMessagesBadge } from '../../lib/messagesBadge';
import { ReportSheet } from '../../components/ReportSheet';

export default function Chat() {
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const { refresh: refreshMessagesBadge } = useMessagesBadge();

  function handleBlockOrReport() {
    if (!otherUserId) return;
    Alert.alert('Block or Report', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(otherUserId);
            router.back();
          } catch (error: any) {
            Alert.alert('Could not block', error.message ?? String(error));
          }
        },
      },
      { text: 'Report', onPress: () => setReportVisible(true) },
    ]);
  }

  useFocusEffect(
    useCallback(() => {
      if (!connectionId) return;

      let unsubscribe: (() => void) | undefined;

      (async () => {
        const { data: userData } = await supabase.auth.getUser();
        setMyId(userData.user?.id ?? null);

        try {
          setMessages(await getMessages(connectionId));
        } catch (error: any) {
          Alert.alert('Could not load messages', error.message);
        }

        const connections = await getMyConnections();
        const conn = connections.find((c) => c.id === connectionId);
        if (conn?.other) {
          setOtherUserId(conn.other.id);
          navigation.setOptions({
            title: conn.other.full_name,
            headerRight: () => (
              <Pressable
                onPress={handleBlockOrReport}
                hitSlop={12}
                style={{ paddingHorizontal: 4 }}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color="#111" />
              </Pressable>
            ),
          });
        }

        await markConnectionRead(connectionId);
        refreshMessagesBadge();

        unsubscribe = subscribeToMessages(connectionId, (message) => {
          setMessages((prev) => [...prev, message]);
          markConnectionRead(connectionId).then(refreshMessagesBadge);
        });
      })();

      return () => unsubscribe?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId, navigation, refreshMessagesBadge, otherUserId])
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body || !connectionId) return;

    setIsSending(true);
    setDraft('');
    try {
      await sendMessage(connectionId, body, otherUserId ?? undefined);
    } catch (error: any) {
      Alert.alert('Could not send message', error.message);
      setDraft(body);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <FlatList
        ref={listRef}
        style={styles.messageList}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi!</Text>}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender_id === myId ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text style={item.sender_id === myId ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {item.body}
            </Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          multiline
        />
        <Pressable
          style={[styles.sendButton, (isSending || !draft.trim()) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={isSending || !draft.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    <ReportSheet
      visible={reportVisible}
      targetUserId={otherUserId}
      context="chat"
      onClose={() => setReportVisible(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  messageList: { flex: 1 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#888', fontSize: 14, marginTop: 40 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 },
  bubbleMine: { backgroundColor: '#111', alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: '#eee', alignSelf: 'flex-start' },
  bubbleTextMine: { color: '#fff', fontSize: 15 },
  bubbleTextTheirs: { color: '#111', fontSize: 15 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: { backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
