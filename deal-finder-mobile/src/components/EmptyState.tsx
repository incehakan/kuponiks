import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import PrimaryButton from './PrimaryButton';
import { colors, spacing, typography } from '../theme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function EmptyState({
  title,
  subtitle,
  ctaLabel,
  onCta,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>◎</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCta ? (
        <PrimaryButton label={ctaLabel} onPress={onCta} style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(91, 45, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconText: {
    fontSize: 28,
    color: colors.primary,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    marginTop: spacing.xl,
    minWidth: 220,
  },
});
