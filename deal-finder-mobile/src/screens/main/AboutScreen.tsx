import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import GlyphIcon from '../../components/GlyphIcon';
import KuponiksLogo from '../../components/KuponiksLogo';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '../../constants/brand';
import { colors, spacing } from '../../theme';
import type { MainStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<MainStackParamList, 'About'>;

export default function AboutScreen({ navigation }: Props): React.JSX.Element {
  const version =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <GlyphIcon name="back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.title}>Hakkımızda</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.body}>
        <KuponiksLogo size="lg" showWordmark showTagline />
        <Text style={styles.tagline}>{APP_NAME} · {APP_TAGLINE}</Text>
        <Text style={styles.copy}>
          Kuponiks, farklı ilan platformlarındaki fırsatları kullanıcıların
          belirlediği kriterlere göre takip eder ve piyasa analiziyle öne çıkarır.
        </Text>
        <Text style={styles.copyMuted}>{APP_DESCRIPTION.replace(/\n/g, ' ')}</Text>
        {version ? (
          <Text style={styles.version}>Sürüm {version}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 12,
  },
  headerSpacer: { width: 26 },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  tagline: {
    marginTop: 16,
    color: colors.accent,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  copy: {
    marginTop: 16,
    color: colors.white,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  copyMuted: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  version: {
    marginTop: 24,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
