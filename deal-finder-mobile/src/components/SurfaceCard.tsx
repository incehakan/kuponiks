import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, shadows } from '../theme';

interface SurfaceCardProps {
  children: React.ReactNode;
  elevated?: boolean;
  style?: ViewStyle;
}

export default function SurfaceCard({
  children,
  elevated = false,
  style,
}: SurfaceCardProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
    ...shadows.card,
  },
});
