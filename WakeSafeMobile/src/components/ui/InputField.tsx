import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export const InputField = React.forwardRef<TextInput, Props>(({ label, error, style, ...props }, ref) => {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
  },
  inputError: { borderColor: colors.danger },
  error: { marginTop: 4, color: colors.danger, fontSize: typography.caption },
});
