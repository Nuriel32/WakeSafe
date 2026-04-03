import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "primary" | "danger" | "neutral";
};

export const Button: React.FC<Props> = ({ title, onPress, disabled, loading, tone = "primary" }) => {
  const bg =
    tone === "danger" ? colors.danger : tone === "neutral" ? colors.surfaceMuted : colors.primary;
  const textColor = tone === "neutral" ? colors.text : "#fff";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg }, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.text, { color: textColor }]}>{title}</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.9 },
});
