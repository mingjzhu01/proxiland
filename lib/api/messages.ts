import { supabase } from '../supabase';

export type Message = {
  id: string;
  connection_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function getMessages(connectionId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(connectionId: string, body: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('messages').insert({
    connection_id: connectionId,
    sender_id: userData.user.id,
    body: body.trim(),
  });

  if (error) throw error;
}

export async function getUnreadMessageCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_message_count');
  if (error) throw error;
  return data ?? 0;
}

export async function markConnectionRead(connectionId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_connection_read', { p_connection_id: connectionId });
  if (error) throw error;
}

export function subscribeToMessages(
  connectionId: string,
  onInsert: (message: Message) => void
): () => void {
  const channel = supabase
    .channel(`messages:${connectionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${connectionId}` },
      (payload) => onInsert(payload.new as Message)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
