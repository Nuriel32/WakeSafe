import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../../theme/tokens";

type Tone = "success" | "error" | "info";
type ToastState = { message: string; tone: Tone } | null;

const ToastContext = createContext<{ showToast: (message: string, tone?: Tone) => void }>({
  showToast: () => undefined,
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const api = useMemo(
    () => ({
      showToast: (message: string, tone: Tone = "info") => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        setToast({ message, tone });
        timeoutRef.current = setTimeout(() => setToast(null), 2600);
      },
    }),
    []
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View style={styles.wrap} pointerEvents="none">
          <View
            style={[
              styles.toast,
              toast.tone === "success" && styles.success,
              toast.tone === "error" && styles.error,
            ]}
          >
            <Text style={styles.text}>{toast.message}</Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "center",
  },
  toast: {
    width: "100%",
    backgroundColor: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.danger },
  text: { color: "#fff", fontWeight: "600", textAlign: "center" },
});
