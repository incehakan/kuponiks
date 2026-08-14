import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import { colors, radii, spacing } from '../theme';
import type { Deal } from '../types/models';
import {
  DEFAULT_DEAL_FEED_FILTERS,
  platformLabel,
  uniqueSorted,
  type DealFeedFilters,
  type DealFeedSort,
} from '../utils/feedFilters';

interface DealFeedFilterSheetProps {
  visible: boolean;
  deals: Deal[];
  value: DealFeedFilters;
  onClose: () => void;
  onApply: (next: DealFeedFilters) => void;
}

const SORT_OPTIONS: Array<{ id: DealFeedSort; label: string }> = [
  { id: 'newest', label: 'En Yeni' },
  { id: 'score', label: 'En Yüksek Skor' },
  { id: 'advantage', label: 'En Yüksek Avantaj' },
  { id: 'price', label: 'En Düşük Fiyat' },
];

const SCORE_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Tümü' },
  { value: 50, label: '50+' },
  { value: 60, label: '60+' },
  { value: 70, label: '70+' },
  { value: 80, label: '80+' },
  { value: 90, label: '90+' },
];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function DealFeedFilterSheet({
  visible,
  deals,
  value,
  onClose,
  onApply,
}: DealFeedFilterSheetProps): React.JSX.Element {
  const [draft, setDraft] = useState<DealFeedFilters>(value);

  const platforms = useMemo(
    () => uniqueSorted(deals.map((d) => d.platform ?? d.source)),
    [deals],
  );
  const brands = useMemo(
    () => uniqueSorted(deals.map((d) => d.brand)),
    [deals],
  );
  const cities = useMemo(
    () => uniqueSorted(deals.map((d) => d.city)),
    [deals],
  );

  const openDraft = (): void => {
    setDraft(value);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={openDraft}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.title}>Fırsatları Filtrele</Text>
          <Text style={styles.subtitle}>
            Yalnızca mevcut fırsat listenizi daraltır. Yeni arama görevi oluşturmaz.
          </Text>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.section}>Sıralama</Text>
            <View style={styles.wrap}>
              {SORT_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  selected={draft.sort === option.id}
                  onPress={() => setDraft((p) => ({ ...p, sort: option.id }))}
                />
              ))}
            </View>

            <Text style={styles.section}>Minimum fırsat skoru</Text>
            <View style={styles.wrap}>
              {SCORE_OPTIONS.map((option) => (
                <Chip
                  key={String(option.value)}
                  label={option.label}
                  selected={draft.minScore === option.value}
                  onPress={() =>
                    setDraft((p) => ({ ...p, minScore: option.value }))
                  }
                />
              ))}
            </View>

            {platforms.length > 0 ? (
              <>
                <Text style={styles.section}>Platform</Text>
                <View style={styles.wrap}>
                  <Chip
                    label="Tümü"
                    selected={!draft.platform}
                    onPress={() => setDraft((p) => ({ ...p, platform: null }))}
                  />
                  {platforms.map((item) => (
                    <Chip
                      key={item}
                      label={platformLabel(item)}
                      selected={draft.platform === item}
                      onPress={() => setDraft((p) => ({ ...p, platform: item }))}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {brands.length > 0 ? (
              <>
                <Text style={styles.section}>Marka</Text>
                <View style={styles.wrap}>
                  <Chip
                    label="Tümü"
                    selected={!draft.brand}
                    onPress={() => setDraft((p) => ({ ...p, brand: null }))}
                  />
                  {brands.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      selected={draft.brand === item}
                      onPress={() => setDraft((p) => ({ ...p, brand: item }))}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {cities.length > 0 ? (
              <>
                <Text style={styles.section}>Şehir</Text>
                <View style={styles.wrap}>
                  <Chip
                    label="Tümü"
                    selected={!draft.city}
                    onPress={() => setDraft((p) => ({ ...p, city: null }))}
                  />
                  {cities.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      selected={draft.city === item}
                      onPress={() => setDraft((p) => ({ ...p, city: item }))}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Sadece piyasanın altında</Text>
              <Switch
                value={draft.onlyBelowMarket}
                onValueChange={(onlyBelowMarket) =>
                  setDraft((p) => ({ ...p, onlyBelowMarket }))
                }
                trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                thumbColor={draft.onlyBelowMarket ? colors.accent : colors.textMuted}
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <SecondaryButton
              label="Temizle"
              onPress={() => {
                onApply(DEFAULT_DEAL_FEED_FILTERS);
                onClose();
              }}
            />
            <PrimaryButton
              label="Filtreyi Uygula"
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 12,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    paddingBottom: 12,
  },
  section: {
    marginTop: 14,
    marginBottom: 8,
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceElevated,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipTextSelected: {
    color: colors.white,
  },
  toggleRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  actions: {
    gap: 10,
    paddingVertical: 12,
  },
});
