import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlyphIcon from '../components/GlyphIcon';

import DealListingImage from '../components/DealListingImage';
import DealScoreBadge from '../components/DealScoreBadge';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import PriceAdvantageBadge from '../components/PriceAdvantageBadge';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { dealsApi, getErrorMessage } from '../services/api';
import { colors, radii, spacing } from '../theme';
import type { Deal } from '../types/models';
import type { MainStackParamList } from '../types/navigation';
import {
  dealHeadline,
  dealLocation,
  marketMedian,
  resolveListingUrl,
  resolveSourceLabel,
} from '../utils/dealDisplay';
import {
  formatKm,
  formatMatchedTaskLabel,
  formatTry,
} from '../utils/formatDeal';

type DealDetailScreenProps = NativeStackScreenProps<
  MainStackParamList,
  'DealDetail'
>;

function confidenceLabel(value: string | null | undefined): string | null {
  const n = (value ?? '').toUpperCase();
  if (n === 'HIGH') return 'Yüksek';
  if (n === 'MEDIUM') return 'Orta';
  if (n === 'LOW') return 'Düşük';
  return value?.trim() ? value : null;
}

function SpecCell({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.specCell}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

export default function DealDetailScreen({
  route,
  navigation,
}: DealDetailScreenProps): React.JSX.Element {
  const dealId = route.params.id || route.params.dealId;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDeal = useCallback(async (): Promise<void> => {
    if (!dealId) {
      setIsLoading(false);
      setDeal(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await dealsApi.getDealById(dealId);
      setDeal(data);
      setLoadError(null);
    } catch (error) {
      setDeal(null);
      setLoadError(
        getErrorMessage(error, 'İlan detayı alınırken bir hata oluştu.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void loadDeal();
  }, [loadDeal]);

  const handleOpenOriginalListing = async (): Promise<void> => {
    if (!deal) {
      return;
    }

    const url = resolveListingUrl(deal);
    if (!url) {
      Alert.alert(
        'İlan bağlantısı bulunamadı',
        'Bu ilan için dış bağlantı tanımlı değil.',
      );
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(
          'İlan bağlantısı bulunamadı',
          'Bu bağlantı cihazda açılamıyor.',
        );
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        'İşlem başarısız',
        getErrorMessage(error, 'İlan tarayıcıda açılamadı. Lütfen tekrar deneyin.'),
      );
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <LoadingSkeleton rows={2} />
      </SafeAreaView>
    );
  }

  if (!deal) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {loadError ? (
          <ErrorState subtitle={loadError} onRetry={() => void loadDeal()} />
        ) : (
          <EmptyState
            title="İlan bulunamadı"
            ctaLabel="Geri dön"
            onCta={() => navigation.goBack()}
          />
        )}
      </SafeAreaView>
    );
  }

  const marketReady = deal.marketStatus === 'READY';
  const listingUrl = resolveListingUrl(deal);
  const location = dealLocation(deal);
  const matched = deal.matchedFilters ?? [];
  const median = marketMedian(deal);
  const advantagePct = deal.priceAdvantagePct ?? deal.dealPercent;
  const advantageAmount =
    marketReady && median != null ? median - deal.price : null;
  const specs: Array<{ label: string; value: string }> = [];
  if (deal.year != null) specs.push({ label: 'Yıl', value: String(deal.year) });
  if (deal.mileage != null) specs.push({ label: 'KM', value: formatKm(deal.mileage) });
  if (deal.fuelType?.trim()) specs.push({ label: 'Yakıt', value: deal.fuelType.trim() });
  if (deal.transmission?.trim()) {
    specs.push({ label: 'Şanzıman', value: deal.transmission.trim() });
  }
  if (deal.bodyType?.trim()) specs.push({ label: 'Kasa', value: deal.bodyType.trim() });
  if (deal.engine?.trim()) specs.push({ label: 'Motor', value: deal.engine.trim() });
  if (deal.color?.trim()) specs.push({ label: 'Renk', value: deal.color.trim() });
  if (deal.traction?.trim()) specs.push({ label: 'Çekiş', value: deal.traction.trim() });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <DealListingImage uri={deal.imageUrl} style={styles.heroImage} />
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <GlyphIcon name="back" size={28} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.panel}>
          <View style={styles.scoreRow}>
            <DealScoreBadge score={deal.dealScore} size="lg" />
            <View style={styles.scoreMeta}>
              <PriceAdvantageBadge pct={advantagePct} />
              <Text style={styles.headline}>{dealHeadline(deal)}</Text>
              {deal.trim ? <Text style={styles.trim}>{deal.trim}</Text> : null}
            </View>
          </View>

          <Text style={styles.price}>{formatTry(deal.price)}</Text>
          {median != null ? (
            <Text style={styles.median}>{formatTry(median)}</Text>
          ) : null}
          {location ? <Text style={styles.location}>{location}</Text> : null}

          <Text style={styles.sectionTitle}>Fırsat Analizi</Text>
          {marketReady ? (
            <View style={styles.analysisRow}>
              <View style={styles.analysisCell}>
                <Text style={styles.analysisLabel}>Piyasa Medyanı</Text>
                <Text style={styles.analysisValue}>
                  {median != null ? formatTry(median) : '—'}
                </Text>
              </View>
              <View style={styles.analysisCell}>
                <Text style={styles.analysisLabel}>Avantaj</Text>
                <Text
                  style={[
                    styles.analysisValue,
                    advantageAmount != null && advantageAmount > 0
                      ? styles.positive
                      : null,
                  ]}
                >
                  {advantageAmount != null ? formatTry(advantageAmount) : '—'}
                </Text>
              </View>
              <View style={styles.analysisCell}>
                <Text style={styles.analysisLabel}>Güven</Text>
                <Text style={styles.analysisValue}>
                  {confidenceLabel(deal.marketConfidence) ?? '—'}
                </Text>
              </View>
              {deal.marketSampleSize != null ? (
                <View style={styles.analysisCell}>
                  <Text style={styles.analysisLabel}>Emsal</Text>
                  <Text style={styles.analysisValue}>
                    {deal.marketSampleSize} ilan
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.insufficient}>Piyasa verisi yetersiz</Text>
          )}

          {specs.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Araç Bilgileri</Text>
              <View style={styles.specGrid}>
                {specs.map((item) => (
                  <SpecCell key={item.label} label={item.label} value={item.value} />
                ))}
              </View>
            </>
          ) : null}

          {matched.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Bu fırsatı yakalayan aramalar</Text>
              {matched.map((filter) => (
                <View key={filter.id} style={styles.matchChip}>
                  <Text style={styles.matchText}>
                    {formatMatchedTaskLabel(filter)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          {resolveSourceLabel(deal) ? (
            <Text style={styles.platform}>{resolveSourceLabel(deal)}</Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.sticky}>
        <SecondaryButton
          label="Aramama Ekle"
          onPress={() => navigation.navigate('Tabs', { screen: 'Filters' })}
          style={styles.stickySecondary}
        />
        {listingUrl ? (
          <PrimaryButton
            label="İlana Git"
            onPress={() => void handleOpenOriginalListing()}
            style={styles.stickyPrimary}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 120,
  },
  hero: {
    height: 240,
    backgroundColor: colors.surfaceElevated,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(8,4,20,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    padding: spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
  },
  scoreMeta: {
    flex: 1,
    gap: 8,
  },
  headline: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  trim: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  price: {
    marginTop: spacing.lg,
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
  },
  median: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 16,
    textDecorationLine: 'line-through',
  },
  location: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 14,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  analysisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  analysisCell: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analysisLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  analysisValue: {
    marginTop: 6,
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  positive: {
    color: colors.success,
  },
  insufficient: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specCell: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  specLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  specValue: {
    marginTop: 4,
    color: colors.white,
    fontWeight: '700',
  },
  matchChip: {
    backgroundColor: 'rgba(91,45,255,0.18)',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  matchText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  platform: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 13,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stickySecondary: {
    flex: 1,
  },
  stickyPrimary: {
    flex: 1,
  },
});
