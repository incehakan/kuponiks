import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import FilterFormModal from '../../components/FilterFormModal';
import UpgradeModal from '../../components/UpgradeModal';
import {
  canAddActiveFilter,
  getUpgradeTargetForFilterLimit,
} from '../../constants/planFeatures';
import { useAuth } from '../../context/AuthContext';
import { filtersApi, getErrorMessage, getHttpStatus } from '../../services/api';
import type { Filter } from '../../types/models';
import type { MainTabParamList } from '../../types/navigation';
import {
  formatFilterSummary,
  formatFilterTaskTitle,
} from '../../utils/filterForm';

function getActiveFilterCount(filters: Filter[]): number {
  return filters.filter((item) => item.isActive !== false).length;
}

export default function FiltersScreen(): React.JSX.Element {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    } catch (error) {
      setFilters([]);
      Alert.alert(
        'Görevler yüklenemedi',
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
  const subscriptionPlan = user?.subscriptionPlan ?? 'FREE';

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

  const renderItem: ListRenderItem<Filter> = ({ item }) => {
    const isDeleting = deletingId === item.id;
    const isToggling = togglingId === item.id;
    const isActive = item.isActive !== false;

    return (
      <View style={[styles.card, !isActive && styles.cardInactive]}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{formatFilterTaskTitle(item)}</Text>
            <Text style={styles.cardMeta}>{item.category}</Text>
            <Text style={styles.cardMeta}>{formatFilterSummary(item)}</Text>
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>
                {isActive ? 'Aktif' : 'Pasif'} · Skor ≥{item.minDealScore}
              </Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>
                {isActive ? 'Aktif' : 'Pasif'}
              </Text>
              {isToggling ? (
                <ActivityIndicator size="small" color="#FF7A00" />
              ) : (
                <Switch
                  value={isActive}
                  onValueChange={() => void handleToggleFilter(item)}
                  trackColor={{ false: '#2A164D', true: '#8A2BE2' }}
                  thumbColor={isActive ? '#FF7A00' : '#666688'}
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => openEditModal(item)}
              activeOpacity={0.85}
            >
              <Text style={styles.editButtonText}>Düzenle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteButton, isDeleting && styles.buttonDisabled]}
              onPress={() => handleDeleteFilter(item)}
              disabled={isDeleting}
              activeOpacity={0.85}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteButtonText}>Sil</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const safeFilters = Array.isArray(filters) ? filters : [];

  if (isLoading && safeFilters.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF7A00" />
        <Text style={styles.loadingText}>Arama görevleri yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={safeFilters}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          safeFilters.length === 0 ? styles.emptyContent : styles.listContent
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Arama Görevlerim</Text>
            <Text style={styles.headerSubtitle}>
              Marka, model, bütçe ve fırsat skoruna göre ilan takibi oluşturun.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Henüz arama göreviniz yok</Text>
            <Text style={styles.emptySubtitle}>
              Yeni bir görev oluşturarak düşen fırsatları yakalayın.
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={openCreateModal}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyCtaText}>Yeni Arama Oluştur</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={openCreateModal}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+ Yeni Arama</Text>
      </TouchableOpacity>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12022B',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12022B',
  },
  loadingText: {
    marginTop: 12,
    color: '#A0A0C0',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1A0836',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A164D',
  },
  cardInactive: {
    opacity: 0.72,
    backgroundColor: '#240D47',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#A0A0C0',
    lineHeight: 18,
  },
  scorePill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#3D1E6D',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scorePillText: {
    color: '#FF7A00',
    fontWeight: '800',
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'column',
    gap: 8,
    width: 96,
    alignItems: 'stretch',
  },
  toggleRow: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A0A0C0',
  },
  editButton: {
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyState: {
    marginTop: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#A0A0C0',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: 20,
    backgroundColor: '#FF7A00',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#FF7A00',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 14,
    elevation: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
