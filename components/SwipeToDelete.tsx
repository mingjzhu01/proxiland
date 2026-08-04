import { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

const DELETE_WIDTH = 80;

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
};

export function SwipeToDelete({ children, onDelete }: Props) {
  const swipeableRef = useRef<Swipeable>(null);

  function handleDelete() {
    swipeableRef.current?.close();
    onDelete();
  }

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={(_progress, dragX) => {
        const scale = dragX.interpolate({
          inputRange: [-DELETE_WIDTH, 0],
          outputRange: [1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Animated.Text style={[styles.deleteText, { transform: [{ scale }] }]}>
              Delete
            </Animated.Text>
          </Pressable>
        );
      }}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteButton: {
    width: DELETE_WIDTH,
    backgroundColor: '#cc3333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
