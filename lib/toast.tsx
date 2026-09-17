// One app-wide toast, per the event-connections handoff: dark pill, bottom of the screen above
// the tab bar, auto-dismisses. Rendered once at the root so any screen can call show().
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, fonts } from './theme';

const TOAST_MS = 2200;

const ToastContext = createContext<{ show: (message: string) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
          setMessage(null)
        );
      }, TOAST_MS);
    },
    [opacity]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message ? (
        <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 18,
    right: 18,
    // Clears the tab bar on every device the brief targets; the value is from the handoff.
    bottom: 104,
    backgroundColor: colors.brandMarkDark,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: 'rgba(84,66,54,1)',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 22,
    elevation: 10,
  },
  text: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.brandMarkCream, textAlign: 'center' },
});
