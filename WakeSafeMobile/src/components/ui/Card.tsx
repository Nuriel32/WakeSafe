import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../../theme/tokens";

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export const Card: React.FC<CardProps> = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
