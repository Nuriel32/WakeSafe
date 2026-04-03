import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}) => {
  return <View style={[styles.base, { width, height, borderRadius: radius }, style]} />;
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#e2e8f0',
  },
});
