import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import GlyphIcon from '../../components/GlyphIcon';
import { PLAN_DEFINITIONS } from '../../constants/planFeatures';
import { colors, spacing } from '../../theme';
import type { MainStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<MainStackParamList, 'AccountInfo'>;

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function AccountInfoScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const { fullName, phone, plan } = route.params;
  const planTitle = PLAN_DEFINITIONS[plan]?.title ?? plan;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <GlyphIcon name="back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.title}>Hesap Bilgileri</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Row label="Ad Soyad" value={fullName || '—'} />
          <Row label="Telefon" value={phone || '—'} />
          <Row label="Üyelik / Paket" value={`${planTitle} (${plan})`} />
        </View>
        <Text style={styles.hint}>
          Bu bilgiler hesabınızdan okunur. E-posta alanı henüz hesap modelinde
          bulunmadığı için gösterilmez. Düzenleme endpoint’i olmadığı için kayıtlar
          salt okunurdur.
        </Text>
      </ScrollView>
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
  body: { padding: spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  value: { marginTop: 4, color: colors.white, fontSize: 16, fontWeight: '700' },
  hint: {
    marginTop: 14,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
