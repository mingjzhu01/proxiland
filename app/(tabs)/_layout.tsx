import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRequestsBadge } from '../../lib/requestsBadge';
import { useMessagesBadge } from '../../lib/messagesBadge';
import { logSessionEvent } from '../../lib/api/instrumentation';
import { IntentStatePrompt } from '../../components/IntentStatePrompt';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
  const { pendingCount } = useRequestsBadge();
  const { unreadCount } = useMessagesBadge();

  useEffect(() => {
    logSessionEvent('session_open');
  }, []);

  return (
    <>
      <IntentStatePrompt />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: 'rgba(247,243,236,0.92)',
            borderTopColor: colors.rule,
            borderTopWidth: 1,
            paddingTop: 9,
          },
          tabBarLabelStyle: { fontSize: 9.5, fontWeight: '600' },
          tabBarBadgeStyle: { backgroundColor: colors.brass, color: colors.inkOn },
        }}
      >
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Nearby',
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="paper-plane" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: 'People',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
      </Tabs>
    </>
  );
}
