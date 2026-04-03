import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/tokens";

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
};

export const Screen: React.FC<ScreenProps> = ({ children, scroll = true, contentStyle }) => {
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scrollContent, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: spacing.lg },
});
