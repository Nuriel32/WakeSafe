import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";

type Props = {
  title: string;
  description: string;
  icon?: string;
};

export const EmptyState: React.FC<Props> = ({ title, description, icon = " " }) => (
  <View style={styles.container}>
    <Text style={styles.icon}>{icon}</Text>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  icon: { fontSize: 54, marginBottom: spacing.md },
  title: { fontSize: typography.section, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  description: { fontSize: typography.body, color: colors.textMuted, textAlign: "center" },
});
