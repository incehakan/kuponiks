import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  ListRenderItem,
  Platform,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dealsApi, getErrorMessage } from '../../services/api';
import { syncExpoPushTokenWithBackend } from '../../services/pushNotifications';
import type { Deal } from '../../types/models';
import type { MainStackParamList, MainTabParamList } from '../../types/navigation';

interface DealScoreBadgeProps {
  dealScore: number;
  dealPercent: number;
}

interface SourceBadgeProps {
  sourceLabel: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

function resolveSourceLabel(deal: Deal): string {
  const platformName = (deal.source || deal.platform || 'Sahibinden').trim();
  const raw = platformName.toLowerCase();

  if (!raw || raw === 'mock' || raw === 'mock-seeder') {
    return 'Sahibinden';
  }
  if (raw.includes('sahibinden')) {
    return 'Sahibinden';
  }
  if (raw.includes('arabam')) {
    return 'Arabam.com';
  }
  if (raw.includes('letgo')) {
    return 'Letgo';
  }
  if (raw.includes('hepsiemlak')) {
    return 'Hepsiemlak';
  }

  return platformName.charAt(0).toUpperCase() + platformName.slice(1);
}

function resolveListingUrl(deal: Deal): string | null {
  const candidates = [deal.originalUrl, deal.sourceUrl, deal.listingUrl];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveCategoryVisual(deal: Deal): { icon: string; bg: string } {
  const haystack = `${deal.title} ${deal.city}`.toLocaleLowerCase('tr-TR');

  if (
    haystack.includes('daire') ||
    haystack.includes('konut') ||
    haystack.includes('emlak') ||
    haystack.includes('3+1') ||
    haystack.includes('2+1')
  ) {
    return { icon: '🏠', bg: '#FFEDD5' };
  }

  if (
    haystack.includes('iphone') ||
    haystack.includes('telefon') ||
    haystack.includes('samsung') ||
    haystack.includes('elektronik')
  ) {
    return { icon: '📱', bg: '#DBEAFE' };
  }

  if (
    haystack.includes('yamaha') ||
    haystack.includes('motosiklet') ||
    haystack.includes('nmax') ||
    haystack.includes('motor')
  ) {
    return { icon: '🏍️', bg: '#FED7AA' };
  }

  if (
    haystack.includes('honda') ||
    haystack.includes('civic') ||
    haystack.includes('otomobil') ||
    haystack.includes('araba') ||
    haystack.includes('suv')
  ) {
    return { icon: '🚗', bg: '#3D1E6D' };
  }

  return { icon: '🏷️', bg: '#2A164D' };
}

function DealScoreBadge({
  dealScore,
  dealPercent,
}: DealScoreBadgeProps): React.JSX.Element {
  const isHighScore = dealScore >= 80;
  const badgeStyle = isHighScore ? styles.badgeGreen : styles.badgeYellow;
  const textStyle = isHighScore ? styles.badgeGreenText : styles.badgeYellowText;
  const percentLabel = dealPercent > 0 ? dealPercent : Math.max(dealScore - 60, 0);

  return (
    <View style={[styles.badge, badgeStyle]}>
      <Text style={[styles.badgeText, textStyle]}>
        %{percentLabel} Fırsat · Skor {dealScore}
      </Text>
    </View>
  );
}

function SourceBadge({ sourceLabel }: SourceBadgeProps): React.JSX.Element {
  const tone = resolvePlatformTone(sourceLabel);
  return (
    <View style={[styles.sourceBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.sourceBadgeText, { color: tone.text }]}>{sourceLabel}</Text>
    </View>
  );
}

function resolvePlatformTone(label: string): { bg: string; border: string; text: string } {
  const raw = label.toLocaleLowerCase('tr-TR');
  if (raw.includes('sahibinden')) {
    return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };
  }
  if (raw.includes('arabam')) {
    return { bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF' };
  }
  if (raw.includes('hepsiemlak')) {
    return { bg: '#FCE7F3', border: '#F9A8D4', text: '#9D174D' };
  }
  if (raw.includes('letgo')) {
    return { bg: '#FFEDD5', border: '#FDBA74', text: '#9A3412' };
  }
  return { bg: '#EEF2FF', border: '#C7D2FE', text: '#3730A3' };
}

interface DealCardProps {
  deal: Deal;
  highlighted?: boolean;
  onOpenDetail: (deal: Deal) => void;
  onOpenListing: (deal: Deal) => void;
}

function DealCard({
  deal,
  highlighted = false,
  onOpenDetail,
  onOpenListing,
}: DealCardProps): React.JSX.Element {
  const sourceLabel = resolveSourceLabel(deal);
  const visual = resolveCategoryVisual(deal);

  return (
    <Pressable
      style={[styles.card, highlighted ? styles.cardHighlighted : null]}
      onPress={() => onOpenDetail(deal)}
    >
      <View style={styles.cardBodyRow}>
        <View style={[styles.mediaPlaceholder, { backgroundColor: visual.bg }]}>
          <Text style={styles.mediaPlaceholderIcon}>{visual.icon}</Text>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={styles.title} numberOfLines={2}>
              {deal.title}
            </Text>
            <SourceBadge sourceLabel={sourceLabel} />
          </View>

          <DealScoreBadge dealScore={deal.dealScore} dealPercent={deal.dealPercent} />

          <Text style={styles.city}>{deal.city}</Text>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Fiyat</Text>
              <Text style={styles.price}>{formatCurrency(deal.price)}</Text>
            </View>
            <View style={styles.marketBlock}>
              <Text style={styles.priceLabel}>Piyasa Ort.</Text>
              <Text style={styles.marketAverage}>
                {formatCurrency(deal.marketAverage)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.ctaButton}
        onPress={(event) => {
          event.stopPropagation?.();
          onOpenListing(deal);
        }}
      >
        <Text style={styles.ctaButtonText}>İlana Git</Text>
      </Pressable>
    </Pressable>
  );
}

export default function HomeScreen(): React.JSX.Element {
  const route = useRoute<RouteProp<MainTabParamList, 'Home'>>();
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [highlightedDealId, setHighlightedDealId] = useState<string | null>(
    null,
  );

  const loadDeals = useCallback(async (refreshing = false): Promise<void> => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await dealsApi.getDeals();
      setDeals(Array.isArray(data) ? data : []);
    } catch (error) {
      if (!refreshing) {
        setDeals([]);
      }
      Alert.alert(
        'İlanlar yüklenemedi',
        getErrorMessage(
          error,
          'Kelepir ilanlar alınırken bir hata oluştu. Lütfen tekrar deneyin.',
        ),
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDeals();
    }, [loadDeals]),
  );

  useEffect(() => {
    // Home ilk yüklemede push token yoksa arka planda yeniden alıp DB'ye yaz.
    void (async () => {
      try {
        const saved = await syncExpoPushTokenWithBackend();
        if (saved) {
          console.log('[HomeScreen] Push token kontrolü tamam:', saved);
        } else {
          console.warn(
            '[HomeScreen] Push token alınamadı/kaydedilemedi — sonraki odaklanmada tekrar denenecek.',
          );
        }
      } catch (error) {
        console.warn(
          '[HomeScreen] Push token sync hatası:',
          getErrorMessage(error, 'bilinmeyen hata'),
        );
      }
    })();
  }, []);

  useEffect(() => {
    const dealId = route.params?.dealId;
    if (!dealId) {
      setHighlightedDealId(null);
      return;
    }
    setHighlightedDealId(dealId);
    navigation.navigate('DealDetail', { id: dealId, dealId });
  }, [route.params?.dealId, navigation]);

  const handleOpenDetail = useCallback(
    (deal: Deal): void => {
      navigation.navigate('DealDetail', { id: deal.id, dealId: deal.id });
    },
    [navigation],
  );

  const handleOpenListing = useCallback(async (deal: Deal): Promise<void> => {
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
  }, []);

  const renderItem: ListRenderItem<Deal> = ({ item }) => (
    <DealCard
      deal={item}
      highlighted={highlightedDealId === item.id}
      onOpenDetail={handleOpenDetail}
      onOpenListing={(deal) => void handleOpenListing(deal)}
    />
  );

  const safeDeals = Array.isArray(deals) ? deals : [];

  if (isLoading && safeDeals.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View
          style={[
            styles.centered,
            {
              paddingTop:
                Platform.OS === 'ios' ? 10 : StatusBar.currentHeight ?? 0,
            },
          ]}
        >
          <ActivityIndicator size="large" color="#FF7A00" />
          <Text style={styles.loadingText}>Kelepir ilanlar yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View
        style={[
          styles.container,
          {
            paddingTop:
              Platform.OS === 'ios' ? 10 : StatusBar.currentHeight ?? 0,
          },
        ]}
      >
        <FlatList
          data={safeDeals}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContentBase,
            safeDeals.length === 0 ? styles.emptyContent : null,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadDeals(true)}
              tintColor="#FF7A00"
              colors={['#FF7A00']}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderTitle}>Fırsatlar</Text>
              <Text style={styles.listHeaderSubtitle}>
                Kelepir ilan akışı · Kart veya İlana Git ile tarayıcıda açılır
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Henüz kelepir ilan yok</Text>
              <Text style={styles.emptySubtitle}>
                Aşağı çekerek yenileyin veya alarm filtrelerinizi kontrol edin.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#12022B',
  },
  container: {
    flex: 1,
    backgroundColor: '#12022B',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12022B',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#A0A0C0',
    fontSize: 15,
  },
  listContentBase: {
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  listHeader: {
    marginBottom: 16,
  },
  listHeaderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  listHeaderSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#A0A0C0',
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1A0836',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A164D',
  },
  cardHighlighted: {
    borderColor: '#FF7A00',
    borderWidth: 2,
    backgroundColor: '#240D47',
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mediaPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPlaceholderIcon: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  sourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeGreen: {
    backgroundColor: '#3D1E6D',
  },
  badgeYellow: {
    backgroundColor: '#3D1E6D',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  badgeGreenText: {
    color: '#FF7A00',
  },
  badgeYellowText: {
    color: '#FF7A00',
  },
  city: {
    marginTop: 10,
    color: '#A0A0C0',
    fontSize: 14,
    fontWeight: '500',
  },
  priceRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marketBlock: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666688',
    marginBottom: 4,
    fontWeight: '600',
  },
  price: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  marketAverage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A0A0C0',
  },
  ctaButton: {
    marginTop: 16,
    backgroundColor: '#12022B',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#A0A0C0',
    textAlign: 'center',
    lineHeight: 20,
  },
});
