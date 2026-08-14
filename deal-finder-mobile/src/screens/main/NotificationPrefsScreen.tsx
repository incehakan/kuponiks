import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import GlyphIcon from '../../components/GlyphIcon';
import PrimaryButton from '../../components/PrimaryButton';
import { filtersApi, getErrorMessage } from '../../services/api';
import { colors, spacing } from '../../theme';
import type { Filter } from '../../types/models';
import type { MainStackParamList } from '../../types/navigation';
import { formatFilterTaskTitle } from '../../utils/filterForm';

type Props = NativeStackScreenProps<MainStackParamList, 'NotificationPrefs'>;

export default function NotificationPrefsScreen({
  navigation,
}: Props): React.JSX.Element {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await filtersApi.getFilters();
      setFilters(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(
        getErrorMessage(err, 'Arama görevleri alınamadı.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const patch = async (
    filter: Filter,
    patchData: { notifyPush?: boolean; notifyTelegram?: boolean },
  ): Promise<void> => {
    setSavingId(filter.id);
    try {
      const updated = await filtersApi.updateFilter(filter.id, patchData);
      setFilters((prev) =>
        prev.map((item) => (item.id === filter.id ? { ...item, ...updated } : item)),
      );
    } catch {
      await load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <GlyphIcon name="back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.title}>Bildirim Tercihleri</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>
          Bildirim tercihleri arama görevi bazında yönetilir. Global bir bildirim
          profili yoktur.
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : filters.length === 0 ? (
          <Text style={styles.muted}>Aktif arama göreviniz yok.</Text>
        ) : (
          filters.map((filter) => (
            <View key={filter.id} style={styles.card}>
              <Text style={styles.task}>{formatFilterTaskTitle(filter)}</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Push bildirimi</Text>
                <Switch
                  value={filter.notifyPush !== false}
                  disabled={savingId === filter.id}
                  onValueChange={(notifyPush) => {
                    void patch(filter, { notifyPush });
                  }}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                  thumbColor={
                    filter.notifyPush !== false ? colors.accent : colors.textMuted
                  }
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Telegram</Text>
                <Switch
                  value={Boolean(filter.notifyTelegram)}
                  disabled={savingId === filter.id}
                  onValueChange={(notifyTelegram) => {
                    void patch(filter, { notifyTelegram });
                  }}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                  thumbColor={
                    filter.notifyTelegram ? colors.accent : colors.textMuted
                  }
                />
              </View>
            </View>
          ))
        )}
        <PrimaryButton
          label="Arama Görevlerime Git"
          onPress={() =>
            navigation.navigate('Tabs', { screen: 'Filters' })
          }
          style={styles.cta}
        />
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
  lead: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  muted: { color: colors.textMuted, marginBottom: 16 },
  error: { color: colors.danger, marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  task: { color: colors.white, fontWeight: '800', fontSize: 16, marginBottom: 10 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchLabel: { color: colors.textSecondary, fontWeight: '600' },
  cta: { marginTop: 8 },
});
