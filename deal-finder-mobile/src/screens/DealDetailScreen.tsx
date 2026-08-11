import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dealsApi, getErrorMessage } from '../services/api';
import type { Deal } from '../types/models';
import type { MainStackParamList } from '../types/navigation';

type DealDetailScreenProps = NativeStackScreenProps<
  MainStackParamList,
  'DealDetail'
>;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

function scoreColor(dealScore: number): string {
  if (dealScore >= 90) {
    return '#16A34A';
  }
  if (dealScore >= 80) {
    return '#CA8A04';
  }
  return '#EA580C';
}

function resolveListingUrl(deal: Deal): string | null {
  const url = deal.listingUrl || deal.originalUrl || deal.sourceUrl;
  return url?.trim() ? url.trim() : null;
}

export default function DealDetailScreen({
  route,
  navigation,
}: DealDetailScreenProps): React.JSX.Element {
  const dealId = route.params.id || route.params.dealId;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
    } catch (error) {
      setDeal(null);
      Alert.alert(
        'İlan yüklenemedi',
        getErrorMessage(error, 'İlan detayı alınırken bir hata oluştu.'),
        [{ text: 'Geri', onPress: () => navigation.goBack() }],
      );
    } finally {
      setIsLoading(false);
    }
  }, [dealId, navigation]);

  useEffect(() => {
    void loadDeal();
  }, [loadDeal]);

  const handleOpenOriginalListing = async (): Promise<void> => {
    if (!deal) {
      return;
    }

    const url = resolveListingUrl(deal);
    if (!url) {
      Alert.alert('İlan bağlantısı bulunamadı', 'Bu ilan için dış bağlantı tanımlı değil.');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('İlan bağlantısı bulunamadı', 'Bu bağlantı cihazda açılamıyor.');
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF7A00" />
          <Text style={styles.loadingText}>İlan detayı yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!deal) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>İlan bulunamadı</Text>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryButtonText}>Geri dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const badgeColor = scoreColor(deal.dealScore);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>İlan Detayı</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{deal.title}</Text>
        <Text style={styles.city}>{deal.city}</Text>

        <View style={[styles.scoreBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.scoreBadgeText}>
            Kelepir Skoru {deal.dealScore}
            {deal.dealPercent > 0 ? ` · %${deal.dealPercent} piyasa altı` : ''}
          </Text>
        </View>

        <View style={styles.priceCard}>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>İlan Fiyatı</Text>
            <Text style={styles.priceValue}>{formatCurrency(deal.price)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>Piyasa Ort.</Text>
            <Text style={styles.marketValue}>
              {formatCurrency(deal.marketAverage)}
            </Text>
          </View>
        </View>

        {deal.platform ? (
          <Text style={styles.platform}>Kaynak: {deal.platform}</Text>
        ) : null}

        <Pressable
          style={styles.ctaButton}
          onPress={() => void handleOpenOriginalListing()}
        >
          <Text style={styles.ctaButtonText}>Orijinal İlana Git</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#12022B',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#A0A0C0',
    fontSize: 15,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A0836',
    borderBottomWidth: 1,
    borderBottomColor: '#2A164D',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF7A00',
    minWidth: 64,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSpacer: {
    minWidth: 64,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  city: {
    marginTop: 8,
    fontSize: 15,
    color: '#A0A0C0',
  },
  scoreBadge: {
    alignSelf: 'flex-start',
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scoreBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  priceCard: {
    marginTop: 20,
    backgroundColor: '#1A0836',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A164D',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceCol: {
    flex: 1,
  },
  priceDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#2A164D',
    marginHorizontal: 12,
  },
  priceLabel: {
    fontSize: 12,
    color: '#666688',
    fontWeight: '600',
    marginBottom: 6,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  marketValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#A0A0C0',
  },
  platform: {
    marginTop: 14,
    fontSize: 13,
    color: '#A0A0C0',
  },
  ctaButton: {
    marginTop: 28,
    backgroundColor: '#FF7A00',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3D1E6D',
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontWeight: '700',
  },
});
