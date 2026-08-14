import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

interface DealScoreBadgeProps {
  score: number;
  size?: 'sm' | 'lg';
}

export function scoreRingColor(score: number): string {
  if (score >= 80) {
    return colors.accent;
  }
  if (score >= 60) {
    return colors.warning;
  }
  return colors.textMuted;
}

export default function DealScoreBadge({
  score,
  size = 'sm',
}: DealScoreBadgeProps): React.JSX.Element {
  const dim = size === 'lg' ? 88 : 56;
  const ring = size === 'lg' ? 6 : 4;
  const color = scoreRingColor(score);
  const value = Number.isFinite(score) ? Math.round(score) : 0;

  return (
    <View
      style={[
        styles.ring,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          borderWidth: ring,
          borderColor: color,
          backgroundColor: 'rgba(8, 4, 20, 0.82)',
        },
      ]}
      accessibilityLabel={`Fırsat skoru ${value}`}
    >
      <Text
        style={[
          styles.value,
          size === 'lg' ? styles.valueLg : styles.valueSm,
          { color },
        ]}
      >
        {value}
      </Text>
      {size === 'lg' ? <Text style={styles.caption}>skor</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typography.score,
  },
  valueSm: {
    fontSize: 16,
  },
  valueLg: {
    fontSize: 28,
    lineHeight: 32,
  },
  caption: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: -2,
  },
});
