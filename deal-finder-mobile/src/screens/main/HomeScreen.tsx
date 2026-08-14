import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlyphIcon from '../../components/GlyphIcon';

import DealCard from '../../components/DealCard';
import DealFeedFilterSheet from '../../components/DealFeedFilterSheet';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import KuponiksLogo from '../../components/KuponiksLogo';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { dealsApi, getErrorMessage } from '../../services/api';
import { syncExpoPushTokenWithBackend } from '../../services/pushNotifications';
import { colors, spacing } from '../../theme';
import type { Deal } from '../../types/models';
import type { MainStackParamList, MainTabParamList } from '../../types/navigation';
import { isRecentMatch } from '../../utils/dealDisplay';
import {
  applyDealFeedFilters,
  DEFAULT_DEAL_FEED_FILTERS,
  type DealFeedFilters,
} from '../../utils/feedFilters';

export default function HomeScreen(): React.JSX.Element {
  const route = useRoute<RouteProp<MainTabParamList, 'Home'>>();
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightedDealId, setHighlightedDealId] = useState<string | null>(
    null,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [feedFilters, setFeedFilters] = useState<DealFeedFilters>(
    DEFAULT_DEAL_FEED_FILTERS,
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
      setLoadError(null);
    } catch (error) {
      if (!refreshing) {
        setDeals([]);
      }
      setLoadError(
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
    void (async () => {
      try {
        const saved = await syncExpoPushTokenWithBackend();
        if (saved) {
          console.log('[HomeScreen] Push token kontrolü tamam:', saved);
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

  const newCount = useMemo(
    () => deals.filter((item) => isRecentMatch(item)).length,
    [deals],
  );

  const visibleDeals = useMemo(
    () => applyDealFeedFilters(deals, feedFilters),
    [deals, feedFilters],
  );

  const renderItem: ListRenderItem<Deal> = ({ item }) => (
    <DealCard
      deal={item}
      highlighted={highlightedDealId === item.id}
      onPress={handleOpenDetail}
    />
  );

  const safeDeals = Array.isArray(visibleDeals) ? visibleDeals : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
        <KuponiksLogo size="sm" showWordmark showTagline={false} style={styles.brand} />
        <Pressable
          onPress={() => tabNavigation.navigate('Notifications')}
          hitSlop={12}
          accessibilityLabel="Bildirimler"
        >
          <GlyphIcon name="bell" size={22} color={colors.white} />
        </Pressable>
      </View>

      {isLoading && safeDeals.length === 0 ? (
        <LoadingSkeleton rows={3} />
      ) : loadError && safeDeals.length === 0 ? (
        <ErrorState subtitle={loadError} onRetry={() => void loadDeals()} />
      ) : (
        <FlatList
          data={safeDeals}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            safeDeals.length === 0 ? styles.emptyContent : null,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadDeals(true)}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.titleRow}>
                <Text style={styles.listHeaderTitle}>Fırsatlar</Text>
                {newCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{newCount} yeni fırsat</Text>
                  </View>
                ) : safeDeals.length > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{safeDeals.length} fırsat</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={styles.filterBtn}
              >
                <GlyphIcon name="options" size={16} color={colors.white} />
                <Text style={styles.filterText}>Filtrele</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            deals.length > 0 ? (
              <EmptyState
                title="Bu filtrelere uygun fırsat yok"
                subtitle="Filtreleri temizleyerek tüm fırsat listenize dönebilirsiniz."
                ctaLabel="Temizle"
                onCta={() => setFeedFilters(DEFAULT_DEAL_FEED_FILTERS)}
              />
            ) : (
              <EmptyState
                title="Henüz fırsat bulunamadı."
                subtitle="Arama görevlerinize uygun ilan bulunduğunda burada göreceksiniz."
                ctaLabel="Arama Görevi Oluştur"
                onCta={() => tabNavigation.navigate('Filters')}
              />
            )
          }
        />
      )}
      <DealFeedFilterSheet
        visible={filterOpen}
        deals={deals}
        value={feedFilters}
        onClose={() => setFilterOpen(false)}
        onApply={setFeedFilters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  listHeader: {
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  listHeaderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.4,
  },
  badge: {
    backgroundColor: 'rgba(91, 45, 255, 0.28)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
});
