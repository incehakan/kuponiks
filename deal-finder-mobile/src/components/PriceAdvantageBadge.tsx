import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../theme';
import { formatPriceAdvantage } from '../utils/formatDeal';

interface PriceAdvantageBadgeProps {
  pct: number | null | undefined;
}

export default function PriceAdvantageBadge({
  pct,
}: PriceAdvantageBadgeProps): React.JSX.Element | null {
  if (pct == null || !Number.isFinite(pct)) {
    return null;
  }
  const cheaper = pct >= 0;
  const label = formatPriceAdvantage(pct);
  if (!label) {
    return null;
  }

  return (
    <View
      style={[styles.pill, cheaper ? styles.cheap : styles.expensive]}
      accessibilityLabel={label}
    >
      <Text style={[styles.text, cheaper ? styles.cheapText : styles.expensiveText]}>
        {cheaper ? label.replace('Daha Ucuz', 'daha ucuz') : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cheap: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
  expensive: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
  cheapText: {
    color: colors.success,
  },
  expensiveText: {
    color: '#FCA5A5',
  },
});
