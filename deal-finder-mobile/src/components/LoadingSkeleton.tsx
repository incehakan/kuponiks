import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

interface LoadingSkeletonProps {
  rows?: number;
}

function Block({ style }: { style?: object }): React.JSX.Element {
  return <View style={[styles.block, style]} />;
}

export default function LoadingSkeleton({
  rows = 3,
}: LoadingSkeletonProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.card}>
          <Block style={styles.image} />
          <View style={styles.body}>
            <Block style={styles.lineWide} />
            <Block style={styles.lineMid} />
            <Block style={styles.lineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  block: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radii.sm,
  },
  image: {
    height: 168,
    borderRadius: 0,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  lineWide: { height: 16, width: '72%' },
  lineMid: { height: 12, width: '54%' },
  lineShort: { height: 18, width: '40%', marginTop: 8 },
});
