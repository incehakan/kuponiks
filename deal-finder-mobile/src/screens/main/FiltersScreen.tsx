import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlyphIcon from '../../components/GlyphIcon';

import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import FilterFormModal from '../../components/FilterFormModal';
import FilterTaskCard from '../../components/FilterTaskCard';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import UpgradeModal from '../../components/UpgradeModal';
import {
  canAddActiveFilter,
  getUpgradeTargetForFilterLimit,
} from '../../constants/planFeatures';
import { useAuth } from '../../context/AuthContext';
import { filtersApi, getErrorMessage, getHttpStatus } from '../../services/api';
import { colors, spacing } from '../../theme';
import type { Filter } from '../../types/models';
import type { MainTabParamList } from '../../types/navigation';
import { formatFilterTaskTitle } from '../../utils/filterForm';

function getActiveFilterCount(filters: Filter[]): number {
  return filters.filter((item) => item.isActive !== false).length;
}

export default function FiltersScreen(): React.JSX.Element {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segment, setSegment] = useState<'active' | 'inactive'>('active');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isPaywallVisible, setIsPaywallVisible] = useState(false);
  const [paywallTarget, setPaywallTarget] = useState<'PRO' | 'VIP'>('PRO');
  const [paywallReason, setPaywallReason] = useState<
    'filter-limit' | 'telegram' | 'whatsapp'
  >('filter-limit');

  const loadFilters = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await filtersApi.getFilters();
      const data = Array.isArray(response)
        ? response
        : Array.isArray((response as { filters?: Filter[] })?.filters)
          ? (response as { filters: Filter[] }).filters
          : [];
      setFilters(
        data.map((item) => ({
          ...item,
          isActive: item.isActive !== false,
        })),
      );
      setLoadError(null);
    } catch (error) {
      setFilters([]);
      setLoadError(
        getErrorMessage(
          error,
          'Arama görevleri alınırken bir hata oluştu. Lütfen tekrar deneyin.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFilters();
    }, [loadFilters]),
  );

  const activeFilterCount = useMemo(
    () => getActiveFilterCount(filters),
    [filters],
  );
  const inactiveCount = filters.length - activeFilterCount;
  const subscriptionPlan = user?.subscriptionPlan ?? 'FREE';
  const visibleFilters = filters.filter((item) =>
    segment === 'active' ? item.isActive !== false : item.isActive === false,
  );

  const showUpgradeModal = useCallback(
    (
      targetPlan: 'PRO' | 'VIP',
      reason: 'filter-limit' | 'telegram' | 'whatsapp' = 'filter-limit',
    ): void => {
      setPaywallTarget(targetPlan);
      setPaywallReason(reason);
      setIsPaywallVisible(true);
    },
    [],
  );

  const openCreateModal = (): void => {
    if (!canAddActiveFilter(subscriptionPlan, activeFilterCount)) {
      showUpgradeModal(
        getUpgradeTargetForFilterLimit(subscriptionPlan) ?? 'PRO',
        'filter-limit',
      );
      return;
    }
    setEditingFilter(null);
    setIsModalVisible(true);
  };

  const openEditModal = (filter: Filter): void => {
    setEditingFilter(filter);
    setIsModalVisible(true);
  };

  const closeModal = (): void => {
    setIsModalVisible(false);
    setEditingFilter(null);
  };

  const handleSaved = (saved: Filter): void => {
    setFilters((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (editingFilter) {
        return list.map((item) =>
          item.id === editingFilter.id ? { ...item, ...saved } : item,
        );
      }
      return [saved, ...list];
    });
    closeModal();
  };

  const handleToggleFilter = async (filter: Filter): Promise<void> => {
    const nextActive = filter.isActive === false;
    if (
      nextActive &&
      !canAddActiveFilter(subscriptionPlan, activeFilterCount)
    ) {
      showUpgradeModal(
        getUpgradeTargetForFilterLimit(subscriptionPlan) ?? 'PRO',
        'filter-limit',
      );
      return;
    }
    setTogglingId(filter.id);
    try {
      const updated = await filtersApi.setFilterActive(filter.id, nextActive);
      setFilters((prev) =>
        Array.isArray(prev)
          ? prev.map((item) =>
              item.id === filter.id
                ? { ...item, ...updated, isActive: updated.isActive !== false }
                : item,
            )
          : [],
      );
    } catch (error) {
      if (getHttpStatus(error) === 403 && nextActive) {
        showUpgradeModal(
          getUpgradeTargetForFilterLimit(subscriptionPlan) ?? 'PRO',
          'filter-limit',
        );
        return;
      }
      Alert.alert(
        'Güncellenemedi',
        getErrorMessage(error, 'Görev durumu güncellenemedi.'),
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteFilter = (filter: Filter): void => {
    Alert.alert(
      'Görevi sil',
      `"${formatFilterTaskTitle(filter)}" silinsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingId(filter.id);
              try {
                await filtersApi.deleteFilter(filter.id);
                setFilters((prev) =>
                  Array.isArray(prev)
                    ? prev.filter((item) => item.id !== filter.id)
                    : [],
                );
              } catch (error) {
                Alert.alert(
                  'Silinemedi',
                  getErrorMessage(error, 'Görev silinemedi.'),
                );
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const renderItem: ListRenderItem<Filter> = ({ item }) => (
    <FilterTaskCard
      filter={item}
      isToggling={togglingId === item.id}
      isDeleting={deletingId === item.id}
      onPress={openEditModal}
      onToggle={(next) => void handleToggleFilter(next)}
      onDelete={handleDeleteFilter}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Arama Görevlerim</Text>
        <Pressable onPress={openCreateModal} hitSlop={10} accessibilityLabel="Yeni görev">
          <GlyphIcon name="add" size={28} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.segments}>
        <Pressable
          style={[styles.seg, segment === 'active' && styles.segActive]}
          onPress={() => setSegment('active')}
        >
          <Text style={[styles.segText, segment === 'active' && styles.segTextActive]}>
            Aktif ({activeFilterCount})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.seg, segment === 'inactive' && styles.segActive]}
          onPress={() => setSegment('inactive')}
        >
          <Text
            style={[styles.segText, segment === 'inactive' && styles.segTextActive]}
          >
            Pasif ({inactiveCount})
          </Text>
        </Pressable>
      </View>

      {isLoading && filters.length === 0 ? (
        <LoadingSkeleton rows={3} />
      ) : loadError && filters.length === 0 ? (
        <ErrorState subtitle={loadError} onRetry={() => void loadFilters()} />
      ) : (
        <FlatList
          data={visibleFilters}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={
            visibleFilters.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListEmptyComponent={
            <EmptyState
              title={
                segment === 'active'
                  ? 'Aktif arama göreviniz yok'
                  : 'Pasif görev yok'
              }
              subtitle="Yeni bir görev oluşturarak düşen fırsatları yakalayın."
              ctaLabel="Arama Görevi Oluştur"
              onCta={openCreateModal}
            />
          }
        />
      )}

      <FilterFormModal
        visible={isModalVisible}
        editingFilter={editingFilter}
        subscriptionPlan={subscriptionPlan}
        onClose={closeModal}
        onSaved={handleSaved}
        onNeedUpgrade={showUpgradeModal}
      />

      <UpgradeModal
        visible={isPaywallVisible}
        targetPlan={paywallTarget}
        reason={paywallReason}
        onUpgrade={() => {
          setIsPaywallVisible(false);
          navigation.navigate('Profile');
        }}
        onClose={() => setIsPaywallVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
  },
  segments: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
  },
  seg: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: {
    backgroundColor: colors.primary,
  },
  segText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  segTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
});
