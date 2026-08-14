import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import SecondaryButton from './SecondaryButton';
import { colors, spacing, typography } from '../theme';

interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Bir şeyler ters gitti.',
  subtitle = 'Lütfen internet bağlantınızı kontrol edip tekrar deneyin.',
  onRetry,
}: ErrorStateProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>!</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {onRetry ? (
        <SecondaryButton label="Tekrar Dene" onPress={onRetry} style={styles.cta} />
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
    backgroundColor: 'rgba(91, 45, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconText: {
    fontSize: 32,
    fontWeight: '800',
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
    minWidth: 200,
  },
});
