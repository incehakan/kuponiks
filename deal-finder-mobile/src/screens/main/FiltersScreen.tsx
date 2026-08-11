import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  ListRenderItem,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { useAuth } from '../../context/AuthContext';
import UpgradeModal from '../../components/UpgradeModal';
import {
  canAddActiveFilter,
  getUpgradeTargetForFilterLimit,
  PLAN_DEFINITIONS,
} from '../../constants/planFeatures';
import { catalogApi, filtersApi, getErrorMessage, getHttpStatus } from '../../services/api';
import type {
  CategoryFlatItem,
  CityItem,
  CreateFilterPayload,
  Filter,
} from '../../types/models';
import type { MainTabParamList } from '../../types/navigation';

interface DealScoreOption {
  score: number;
  title: string;
  subtitle: string;
}

interface FilterFormState {
  categoryPath: string;
  cities: CityItem[];
  keywords: string;
  minPrice: string;
  maxPrice: string;
  minDealScore: number;
  notifyPush: boolean;
  notifyTelegram: boolean;
  notifyWhatsapp: boolean;
}

const DEAL_SCORE_OPTIONS: DealScoreOption[] = [
  {
    score: 70,
    title: 'Skor 70+',
    subtitle: '%10+ İndirimli (İyi Fırsat)',
  },
  {
    score: 80,
    title: 'Skor 80+',
    subtitle: '%20+ İndirimli (Kelepir)',
  },
  {
    score: 90,
    title: 'Skor 90+',
    subtitle: '%30+ İndirimli (Süper Kelepir)',
  },
];

/** Offline / API-failure fallback categories (flat paths). */
const FALLBACK_CATEGORIES: CategoryFlatItem[] = [
  { id: 'vasita-otomobil', path: 'Vasıta > Otomobil', name: 'Otomobil', parent: 'Vasıta' },
  {
    id: 'vasita-suv',
    path: 'Vasıta > Arazi, SUV & Pickup',
    name: 'Arazi, SUV & Pickup',
    parent: 'Vasıta',
  },
  { id: 'vasita-motosiklet', path: 'Vasıta > Motosiklet', name: 'Motosiklet', parent: 'Vasıta' },
  { id: 'emlak-konut', path: 'Emlak > Konut', name: 'Konut', parent: 'Emlak' },
  { id: 'emlak-isyeri', path: 'Emlak > İşyeri', name: 'İşyeri', parent: 'Emlak' },
  { id: 'emlak-arsa', path: 'Emlak > Arsa', name: 'Arsa', parent: 'Emlak' },
  {
    id: 'elektronik-telefon',
    path: 'Elektronik > Cep Telefonu',
    name: 'Cep Telefonu',
    parent: 'Elektronik',
  },
  {
    id: 'elektronik-bilgisayar',
    path: 'Elektronik > Bilgisayar',
    name: 'Bilgisayar',
    parent: 'Elektronik',
  },
  { id: 'ev-beyaz-esya', path: 'Ev & Yaşam > Beyaz Eşya', name: 'Beyaz Eşya', parent: 'Ev & Yaşam' },
  { id: 'ev-mobilya', path: 'Ev & Yaşam > Mobilya', name: 'Mobilya', parent: 'Ev & Yaşam' },
];

/** Offline / API-failure fallback cities. */
const FALLBACK_CITIES: CityItem[] = [
  { id: '00', name: 'Tüm Türkiye' },
  { id: '34', name: 'İstanbul' },
  { id: '06', name: 'Ankara' },
  { id: '35', name: 'İzmir' },
  { id: '16', name: 'Bursa' },
  { id: '07', name: 'Antalya' },
  { id: '01', name: 'Adana' },
  { id: '42', name: 'Konya' },
  { id: '27', name: 'Gaziantep' },
  { id: '33', name: 'Mersin' },
  { id: '38', name: 'Kayseri' },
  { id: '41', name: 'Kocaeli' },
  { id: '55', name: 'Samsun' },
  { id: '21', name: 'Diyarbakır' },
  { id: '31', name: 'Hatay' },
  { id: '09', name: 'Aydın' },
  { id: '45', name: 'Manisa' },
  { id: '10', name: 'Balıkesir' },
  { id: '20', name: 'Denizli' },
  { id: '48', name: 'Muğla' },
];

const PRICE_ACCESSORY_ID = 'filters-price-accessory';

const INITIAL_FORM: FilterFormState = {
  categoryPath: '',
  cities: [],
  keywords: '',
  minPrice: '',
  maxPrice: '',
  minDealScore: 70,
  notifyPush: true,
  notifyTelegram: false,
  notifyWhatsapp: false,
};

function formatPriceRange(filter: Filter): string {
  const min = filter.minPrice != null ? `${filter.minPrice.toLocaleString('tr-TR')} TL` : '—';
  const max = filter.maxPrice != null ? `${filter.maxPrice.toLocaleString('tr-TR')} TL` : '—';
  return `${min} – ${max}`;
}

function getDealScoreLabel(score: number): string {
  const option = DEAL_SCORE_OPTIONS.find((item) => item.score === score);
  return option ? option.subtitle : `Min Skor: ${score}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function getActiveFilterCount(filters: Filter[]): number {
  return filters.filter((item) => item.isActive !== false).length;
}

export default function FiltersScreen(): React.JSX.Element {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [categories, setCategories] = useState<CategoryFlatItem[]>(FALLBACK_CATEGORIES);
  const [citiesCatalog, setCitiesCatalog] = useState<CityItem[]>(FALLBACK_CITIES);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isCityModalOpen, setIsCityModalOpen] = useState<boolean>(false);
  const [categorySearch, setCategorySearch] = useState<string>('');
  const [citySearch, setCitySearch] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isPaywallVisible, setIsPaywallVisible] = useState<boolean>(false);
  const [paywallTarget, setPaywallTarget] = useState<'PRO' | 'VIP'>('PRO');
  const [paywallReason, setPaywallReason] = useState<
    'filter-limit' | 'telegram' | 'whatsapp'
  >('filter-limit');
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState<boolean>(false);
  const [form, setForm] = useState<FilterFormState>(INITIAL_FORM);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
        'Filtreler yüklenemedi',
        getErrorMessage(
          error,
          'Alarm filtreleri alınırken bir hata oluştu. Lütfen tekrar deneyin.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async (): Promise<void> => {
    setIsCatalogLoading(true);
    try {
      const [nextCategories, nextCities] = await Promise.all([
        catalogApi.getCategories(),
        catalogApi.getCities(true),
      ]);

      setCategories(
        Array.isArray(nextCategories) && nextCategories.length > 0
          ? nextCategories
          : FALLBACK_CATEGORIES,
      );
      setCitiesCatalog(
        Array.isArray(nextCities) && nextCities.length > 0 ? nextCities : FALLBACK_CITIES,
      );
    } catch {
      setCategories(FALLBACK_CATEGORIES);
      setCitiesCatalog(FALLBACK_CITIES);
    } finally {
      setIsCatalogLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFilters();
      void loadCatalog();
    }, [loadFilters, loadCatalog]),
  );

  const filteredCategories = useMemo(() => {
    const source = categories.length > 0 ? categories : FALLBACK_CATEGORIES;
    const query = normalizeSearch(categorySearch);
    if (!query) {
      return source;
    }
    return source.filter((item) => {
      const haystack = normalizeSearch(`${item.path} ${item.name} ${item.parent ?? ''}`);
      return haystack.includes(query);
    });
  }, [categories, categorySearch]);

  const filteredCities = useMemo(() => {
    const source = citiesCatalog.length > 0 ? citiesCatalog : FALLBACK_CITIES;
    const query = normalizeSearch(citySearch);
    if (!query) {
      return source;
    }
    return source.filter((item) =>
      normalizeSearch(`${item.name} ${item.id}`).includes(query),
    );
  }, [citiesCatalog, citySearch]);

  const resolveCitiesFromFilter = useCallback(
    (cityValue: string | undefined): CityItem[] => {
      if (!cityValue?.trim()) {
        return [];
      }

      const catalog =
        citiesCatalog.length > 0 ? citiesCatalog : FALLBACK_CITIES;
      const names = cityValue
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

      return names.map((name) => {
        const matched = catalog.find(
          (city) =>
            normalizeSearch(city.name) === normalizeSearch(name),
        );
        return matched ?? { id: name, name };
      });
    },
    [citiesCatalog],
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

  const showFilterLimitPaywall = useCallback((): void => {
    const target = getUpgradeTargetForFilterLimit(subscriptionPlan) ?? 'PRO';
    showUpgradeModal(target, 'filter-limit');
  }, [showUpgradeModal, subscriptionPlan]);

  const closePaywall = (): void => {
    setIsPaywallVisible(false);
  };

  const goToUpgrade = (): void => {
    setIsPaywallVisible(false);
    navigation.navigate('Profile');
  };

  const openCreateModal = (): void => {
    if (!canAddActiveFilter(subscriptionPlan, activeFilterCount)) {
      showFilterLimitPaywall();
      return;
    }
    setEditingFilterId(null);
    setForm(INITIAL_FORM);
    setCategorySearch('');
    setCitySearch('');
    setIsCategoryModalOpen(false);
    setIsCityModalOpen(false);
    setIsModalVisible(true);
    void loadCatalog();
  };

  const openEditModal = (filter: Filter): void => {
    const scoreOption = DEAL_SCORE_OPTIONS.find(
      (option) => option.score === filter.minDealScore,
    );

    setEditingFilterId(filter.id);
    setForm({
      categoryPath: filter.category ?? '',
      cities: resolveCitiesFromFilter(filter.city),
      keywords: Array.isArray(filter.keywords)
        ? filter.keywords.join(', ')
        : '',
      minPrice:
        filter.minPrice != null ? String(Math.round(filter.minPrice)) : '',
      maxPrice:
        filter.maxPrice != null ? String(Math.round(filter.maxPrice)) : '',
      minDealScore: scoreOption?.score ?? filter.minDealScore ?? 70,
      notifyPush: filter.notifyPush !== false,
      notifyTelegram: filter.notifyTelegram === true,
      notifyWhatsapp: filter.notifyWhatsapp === true,
    });
    setCategorySearch('');
    setCitySearch('');
    setIsCategoryModalOpen(false);
    setIsCityModalOpen(false);
    setIsModalVisible(true);
    void loadCatalog();
  };

  const closeModal = (): void => {
    if (isSubmitting) {
      return;
    }
    Keyboard.dismiss();
    setIsCategoryModalOpen(false);
    setIsCityModalOpen(false);
    setEditingFilterId(null);
    setIsModalVisible(false);
  };

  const openCategoryModal = (): void => {
    Keyboard.dismiss();
    setIsCityModalOpen(false);
    setIsCategoryModalOpen(true);
  };

  const openCityModal = (): void => {
    Keyboard.dismiss();
    setIsCategoryModalOpen(false);
    setIsCityModalOpen(true);
  };

  const selectCategory = (item: CategoryFlatItem): void => {
    setForm((prev) => ({ ...prev, categoryPath: item.path }));
    setIsCategoryModalOpen(false);
    setCategorySearch('');
  };

  const toggleCity = (city: CityItem): void => {
    setForm((prev) => {
      if (city.name === 'Tüm Türkiye' || city.id === '00') {
        const alreadySelected = prev.cities.some((item) => item.id === city.id);
        return {
          ...prev,
          cities: alreadySelected ? [] : [city],
        };
      }

      const withoutAll = prev.cities.filter(
        (item) => item.id !== '00' && item.name !== 'Tüm Türkiye',
      );
      const exists = withoutAll.some((item) => item.id === city.id);
      const nextCities = exists
        ? withoutAll.filter((item) => item.id !== city.id)
        : [...withoutAll, city];

      return { ...prev, cities: nextCities };
    });
  };

  const removeSelectedCity = (cityId: string): void => {
    setForm((prev) => ({
      ...prev,
      cities: prev.cities.filter((item) => item.id !== cityId),
    }));
  };

  const handleTelegramToggle = (nextValue: boolean): void => {
    if (nextValue && subscriptionPlan === 'FREE') {
      showUpgradeModal('PRO', 'telegram');
      return;
    }
    setForm((prev) => ({ ...prev, notifyTelegram: nextValue }));
  };

  const handleWhatsAppToggle = (nextValue: boolean): void => {
    if (nextValue && subscriptionPlan !== 'VIP') {
      showUpgradeModal('VIP', 'whatsapp');
      return;
    }
    setForm((prev) => ({ ...prev, notifyWhatsapp: nextValue }));
  };

  const handleSaveFilter = async (): Promise<void> => {
    const category = form.categoryPath.trim();
    const selectedCities = form.cities;
    const keywords = form.keywords.trim();
    const minDealScore = form.minDealScore;
    const minPrice = form.minPrice.trim() ? Number(form.minPrice) : undefined;
    const maxPrice = form.maxPrice.trim() ? Number(form.maxPrice) : undefined;

    if (!category) {
      Alert.alert('Eksik bilgi', 'Lütfen bir kategori seçin.');
      return;
    }

    if (selectedCities.length === 0) {
      Alert.alert('Eksik bilgi', 'Lütfen en az bir şehir seçin.');
      return;
    }

    if (
      (minPrice != null && Number.isNaN(minPrice)) ||
      (maxPrice != null && Number.isNaN(maxPrice))
    ) {
      Alert.alert('Geçersiz fiyat', 'Fiyat alanlarına geçerli sayılar girin.');
      return;
    }

    const payload: CreateFilterPayload = {
      category,
      city: selectedCities.map((item) => item.name).join(', '),
      minDealScore,
      minPrice,
      maxPrice,
      notifyPush: form.notifyPush,
      notifyTelegram: form.notifyTelegram,
      notifyWhatsapp: form.notifyWhatsapp,
      ...(keywords || editingFilterId ? { keywords: keywords || '' } : {}),
    };

    setIsSubmitting(true);
    try {
      const response = editingFilterId
        ? await filtersApi.updateFilter(editingFilterId, payload)
        : await filtersApi.createFilter(payload);

      const savedFilter =
        response && typeof response === 'object' && 'filter' in response
          ? (response as { filter: Filter }).filter
          : response;

      if (!savedFilter || typeof savedFilter !== 'object') {
        Alert.alert(
          editingFilterId ? 'Güncellenemedi' : 'Filtre eklenemedi',
          'Sunucudan geçerli bir filtre yanıtı alınamadı.',
        );
        return;
      }

      setFilters((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (editingFilterId) {
          return list.map((item) =>
            item.id === editingFilterId ? savedFilter : item,
          );
        }
        return [savedFilter, ...list];
      });

      Keyboard.dismiss();
      setIsModalVisible(false);
      setEditingFilterId(null);
      setForm(INITIAL_FORM);
      Alert.alert(
        'Başarılı',
        editingFilterId
          ? 'Alarm filtresi güncellendi.'
          : 'Yeni alarm filtresi eklendi.',
      );
    } catch (error) {
      if (getHttpStatus(error) === 403 && !editingFilterId) {
        showFilterLimitPaywall();
        return;
      }
      Alert.alert(
        editingFilterId ? 'Güncellenemedi' : 'Filtre eklenemedi',
        getErrorMessage(
          error,
          editingFilterId
            ? 'Filtre güncellenirken bir hata oluştu. Lütfen tekrar deneyin.'
            : 'Mevcut paketinizdeki maksimum alarm sınırına ulaşmış olabilirsiniz. Paketinizi yükseltmeyi deneyin.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleFilter = async (filter: Filter): Promise<void> => {
    const nextActive = filter.isActive === false;
    if (
      nextActive &&
      !canAddActiveFilter(subscriptionPlan, activeFilterCount)
    ) {
      showFilterLimitPaywall();
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
        showFilterLimitPaywall();
        return;
      }
      Alert.alert(
        'Güncellenemedi',
        getErrorMessage(
          error,
          nextActive
            ? 'Alarm aktifleştirilemedi. Paket limitinizi kontrol edin.'
            : 'Alarm pasife alınamadı. Lütfen tekrar deneyin.',
        ),
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteFilter = (filter: Filter): void => {
    Alert.alert(
      'Filtreyi sil',
      `"${filter.category}" / ${filter.city} filtresi silinsin mi?`,
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
                  getErrorMessage(
                    error,
                    'Filtre silinirken bir hata oluştu. Lütfen tekrar deneyin.',
                  ),
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
    const keywordsLabel =
      Array.isArray(item.keywords) && item.keywords.length > 0
        ? item.keywords.join(', ')
        : null;

    return (
      <View style={[styles.card, !isActive && styles.cardInactive]}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.category}</Text>
            <Text style={styles.cardMeta}>{item.city || 'Tüm Türkiye'}</Text>
            <Text style={styles.cardMeta}>Fiyat: {formatPriceRange(item)}</Text>
            {keywordsLabel ? (
              <Text style={styles.cardMeta}>Kelimeler: {keywordsLabel}</Text>
            ) : null}
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>{getDealScoreLabel(item.minDealScore)}</Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{isActive ? 'Aktif' : 'Pasif'}</Text>
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
        <Text style={styles.loadingText}>Alarmlar yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      <FlatList
        data={safeFilters}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          safeFilters.length === 0 ? styles.emptyContent : styles.listContent
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Alarmlarım</Text>
            <Text style={styles.headerSubtitle}>
              Kelime, şehir, bütçe ve min skor ile kelepir bildirimleri alın.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Henüz filtre yok</Text>
            <Text style={styles.emptySubtitle}>
              Yeni bir alarm ekleyerek düşen fırsatları yakalayın.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openCreateModal} activeOpacity={0.85}>
        <Text style={styles.fabText}>+ Yeni Alarm</Text>
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay} pointerEvents="auto">
          <KeyboardAvoidingView
            style={styles.keyboardAvoider}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            pointerEvents="auto"
          >
            <View style={styles.modalCard} pointerEvents="auto">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingFilterId ? 'Alarmı Düzenle' : 'Yeni Alarm Filtresi'}
                </Text>
                {isKeyboardVisible ? (
                  <TouchableOpacity
                    style={styles.keyboardDismissChip}
                    onPress={() => Keyboard.dismiss()}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.keyboardDismissChipText}>Klavye Kapat</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.label}>Kategori</Text>
                <View style={styles.selectorWrap} pointerEvents="auto">
                  <TouchableOpacity
                    style={styles.selectorButton}
                    onPress={openCategoryModal}
                    activeOpacity={0.75}
                    disabled={isSubmitting}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={[
                        styles.selectorButtonText,
                        !form.categoryPath && styles.selectorPlaceholder,
                      ]}
                      numberOfLines={2}
                    >
                      {form.categoryPath || 'Kategori seçin (örn. Vasıta > Otomobil)'}
                    </Text>
                    <Text style={styles.selectorChevron}>▼</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Şehir</Text>
                <View style={styles.selectorWrap} pointerEvents="auto">
                  <TouchableOpacity
                    style={styles.selectorButton}
                    onPress={openCityModal}
                    activeOpacity={0.75}
                    disabled={isSubmitting}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.selectorButtonText}>
                      {form.cities.length > 0
                        ? `${form.cities.length} şehir seçildi`
                        : 'Şehir seçin (çoklu seçim)'}
                    </Text>
                    <Text style={styles.selectorChevron}>▼</Text>
                  </TouchableOpacity>
                </View>

                {form.cities.length > 0 ? (
                  <View style={styles.chipWrap} pointerEvents="auto">
                    {form.cities.map((city) => (
                      <TouchableOpacity
                        key={city.id}
                        style={[styles.chip, styles.chipSelected]}
                        onPress={() => removeSelectedCity(city.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, styles.chipTextSelected]}>
                          {city.name} ×
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.label}>Aranacak Kelimeler (Opsiyonel)</Text>
                <TextInput
                  style={[styles.input, styles.keywordsInput]}
                  value={form.keywords}
                  onChangeText={(value) =>
                    setForm((prev) => ({ ...prev, keywords: value }))
                  }
                  placeholder="Örn: 3+1, Yeşilyurt, Hatasız, Sunroof"
                  placeholderTextColor="#666688"
                  editable={!isSubmitting}
                  multiline
                  textAlignVertical="top"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                <Text style={styles.label}>Fiyat Aralığı</Text>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={styles.subLabel}>Min Fiyat</Text>
                    <TextInput
                      style={styles.input}
                      value={form.minPrice}
                      onChangeText={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          minPrice: value.replace(/[^0-9]/g, ''),
                        }))
                      }
                      placeholder="0"
                      placeholderTextColor="#666688"
                      keyboardType="number-pad"
                      inputAccessoryViewID={
                        Platform.OS === 'ios' ? PRICE_ACCESSORY_ID : undefined
                      }
                      editable={!isSubmitting}
                    />
                  </View>
                  <View style={styles.half}>
                    <Text style={styles.subLabel}>Max Fiyat</Text>
                    <TextInput
                      style={styles.input}
                      value={form.maxPrice}
                      onChangeText={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          maxPrice: value.replace(/[^0-9]/g, ''),
                        }))
                      }
                      placeholder="500000"
                      placeholderTextColor="#666688"
                      keyboardType="number-pad"
                      inputAccessoryViewID={
                        Platform.OS === 'ios' ? PRICE_ACCESSORY_ID : undefined
                      }
                      editable={!isSubmitting}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Kelepir Seviyesi</Text>
                <View style={styles.scoreOptions} pointerEvents="auto">
                  {DEAL_SCORE_OPTIONS.map((option) => {
                    const selected = form.minDealScore === option.score;
                    return (
                      <TouchableOpacity
                        key={option.score}
                        style={[styles.scoreCard, selected && styles.scoreCardSelected]}
                        onPress={() =>
                          setForm((prev) => ({ ...prev, minDealScore: option.score }))
                        }
                        disabled={isSubmitting}
                        activeOpacity={0.8}
                      >
                        <View style={styles.scoreCardHeader}>
                          <View
                            style={[
                              styles.radioOuter,
                              selected && styles.radioOuterSelected,
                            ]}
                          >
                            {selected ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={styles.scoreCardTitle}>{option.title}</Text>
                        </View>
                        <Text style={styles.scoreCardSubtitle}>{option.subtitle}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.scoreHint}>
                  Piyasa ortalamasının ne kadar altında ilanlarda bildirim almak istediğinizi
                  belirler.
                </Text>

                <Text style={styles.label}>Bildirim Kanalları</Text>
                <View style={styles.notifyRow}>
                  <View style={styles.notifyRowText}>
                    <Text style={styles.notifyTitle}>Mobil Push</Text>
                    <Text style={styles.notifySubtitle}>
                      {PLAN_DEFINITIONS[subscriptionPlan].notificationDelayLabel}
                    </Text>
                  </View>
                  <Switch
                    value={form.notifyPush}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, notifyPush: value }))
                    }
                    disabled={isSubmitting}
                    trackColor={{ false: '#2A164D', true: '#8A2BE2' }}
                    thumbColor={form.notifyPush ? '#FF7A00' : '#666688'}
                  />
                </View>

                <View style={styles.notifyRow}>
                  <View style={styles.notifyRowText}>
                    <Text style={styles.notifyTitle}>Telegram</Text>
                    <Text style={styles.notifySubtitle}>
                      {PLAN_DEFINITIONS[subscriptionPlan].allowsTelegram
                        ? 'PRO ve üzeri'
                        : 'PRO paket gerekli'}
                    </Text>
                  </View>
                  <Switch
                    value={form.notifyTelegram}
                    onValueChange={handleTelegramToggle}
                    disabled={isSubmitting}
                    trackColor={{ false: '#2A164D', true: '#8A2BE2' }}
                    thumbColor={form.notifyTelegram ? '#FF7A00' : '#666688'}
                  />
                </View>

                <View style={styles.notifyRow}>
                  <View style={styles.notifyRowText}>
                    <Text style={styles.notifyTitle}>WhatsApp</Text>
                    <Text style={styles.notifySubtitle}>
                      {PLAN_DEFINITIONS[subscriptionPlan].allowsWhatsApp
                        ? 'VIP paket'
                        : 'VIP paket gerekli'}
                    </Text>
                  </View>
                  <Switch
                    value={form.notifyWhatsapp}
                    onValueChange={handleWhatsAppToggle}
                    disabled={isSubmitting}
                    trackColor={{ false: '#2A164D', true: '#8A2BE2' }}
                    thumbColor={form.notifyWhatsapp ? '#FF7A00' : '#666688'}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter} pointerEvents="auto">
                <TouchableOpacity
                  style={[styles.secondaryButton, isSubmitting && styles.buttonDisabled]}
                  onPress={closeModal}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>İptal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
                  onPress={() => void handleSaveFilter()}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {editingFilterId ? 'Değişiklikleri Kaydet' : 'Filtreyi Kaydet'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Nested pickers as overlays (avoids broken stacked RN Modals). */}
              {isCategoryModalOpen ? (
                <View style={styles.pickerOverlay} pointerEvents="auto">
                  <View style={styles.pickerCard} pointerEvents="auto">
                    <Text style={styles.pickerTitle}>Kategori Seç</Text>
                    <TextInput
                      style={styles.searchInput}
                      value={categorySearch}
                      onChangeText={setCategorySearch}
                      placeholder="Ara: Honda, Konut, Telefon..."
                      placeholderTextColor="#666688"
                      autoCorrect={false}
                      autoCapitalize="none"
                    />

                    {isCatalogLoading && filteredCategories.length === 0 ? (
                      <View style={styles.pickerLoading}>
                        <ActivityIndicator color="#FF7A00" />
                        <Text style={styles.pickerLoadingText}>Kategoriler yükleniyor...</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={filteredCategories}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="always"
                        style={styles.pickerList}
                        ListEmptyComponent={
                          <Text style={styles.pickerEmpty}>Kategori bulunamadı</Text>
                        }
                        renderItem={({ item }) => {
                          const selected = form.categoryPath === item.path;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.pickerItem,
                                selected && styles.pickerItemSelected,
                              ]}
                              onPress={() => selectCategory(item)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.pickerItemText,
                                  selected && styles.pickerItemTextSelected,
                                ]}
                              >
                                {item.path}
                              </Text>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    )}

                    <TouchableOpacity
                      style={styles.pickerCloseButton}
                      onPress={() => setIsCategoryModalOpen(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.pickerCloseButtonText}>Kapat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {isCityModalOpen ? (
                <View style={styles.pickerOverlay} pointerEvents="auto">
                  <View style={styles.pickerCard} pointerEvents="auto">
                    <Text style={styles.pickerTitle}>Şehir Seç</Text>
                    <Text style={styles.pickerSubtitle}>
                      Birden fazla şehir seçebilirsiniz. Seçilenler chip olarak görünür.
                    </Text>
                    <TextInput
                      style={styles.searchInput}
                      value={citySearch}
                      onChangeText={setCitySearch}
                      placeholder="İl ara: İzmir, 35, Ankara..."
                      placeholderTextColor="#666688"
                      autoCorrect={false}
                      autoCapitalize="none"
                    />

                    {isCatalogLoading && filteredCities.length === 0 ? (
                      <View style={styles.pickerLoading}>
                        <ActivityIndicator color="#FF7A00" />
                        <Text style={styles.pickerLoadingText}>Şehirler yükleniyor...</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={filteredCities}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="always"
                        style={styles.pickerList}
                        ListEmptyComponent={
                          <Text style={styles.pickerEmpty}>Şehir bulunamadı</Text>
                        }
                        renderItem={({ item }) => {
                          const selected = form.cities.some((city) => city.id === item.id);
                          return (
                            <TouchableOpacity
                              style={[
                                styles.pickerItem,
                                selected && styles.pickerItemSelected,
                              ]}
                              onPress={() => toggleCity(item)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.pickerItemText,
                                  selected && styles.pickerItemTextSelected,
                                ]}
                              >
                                {item.id !== '00' ? `${item.id} · ${item.name}` : item.name}
                                {selected ? '  ✓' : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    )}

                    <TouchableOpacity
                      style={styles.pickerDoneButton}
                      onPress={() => {
                        setIsCityModalOpen(false);
                        setCitySearch('');
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.pickerDoneButtonText}>
                        Tamam
                        {form.cities.length > 0 ? ` (${form.cities.length})` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={PRICE_ACCESSORY_ID}>
            <View style={styles.inputAccessory}>
              <TouchableOpacity
                onPress={() => Keyboard.dismiss()}
                style={styles.inputAccessoryButton}
                activeOpacity={0.8}
              >
                <Text style={styles.inputAccessoryButtonText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        ) : null}
      </Modal>

      <UpgradeModal
        visible={isPaywallVisible}
        targetPlan={paywallTarget}
        reason={paywallReason}
        onUpgrade={goToUpgrade}
        onClose={closePaywall}
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
    fontSize: 14,
    color: '#A0A0C0',
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
  emptyState: {
    marginTop: 48,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#A0A0C0',
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    zIndex: 20,
    elevation: 8,
    backgroundColor: '#FF7A00',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#12022B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  keyboardAvoider: {
    maxHeight: '94%',
  },
  modalCard: {
    position: 'relative',
    backgroundColor: '#1A0836',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '100%',
    overflow: 'hidden',
    zIndex: 1,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 2,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  keyboardDismissChip: {
    backgroundColor: '#3D1E6D',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  keyboardDismissChipText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 12,
  },
  modalScroll: {
    maxHeight: 480,
    zIndex: 2,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A0A0C0',
    marginBottom: 8,
    marginTop: 10,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A0A0C0',
    marginBottom: 6,
  },
  selectorWrap: {
    zIndex: 5,
    elevation: 5,
  },
  selectorButton: {
    borderWidth: 1,
    borderColor: '#2A164D',
    backgroundColor: '#240D47',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 52,
  },
  selectorButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  selectorPlaceholder: {
    color: '#666688',
    fontWeight: '500',
  },
  selectorChevron: {
    color: '#A0A0C0',
    fontSize: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#2A164D',
    backgroundColor: '#1A0836',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: '#FF7A00',
    borderColor: '#FF7A00',
  },
  chipText: {
    color: '#A0A0C0',
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A164D',
    backgroundColor: '#240D47',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  keywordsInput: {
    minHeight: 72,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  scoreOptions: {
    gap: 10,
  },
  scoreCard: {
    borderWidth: 1,
    borderColor: '#2A164D',
    backgroundColor: '#240D47',
    borderRadius: 14,
    padding: 14,
  },
  scoreCardSelected: {
    borderColor: '#FF7A00',
    backgroundColor: '#240D47',
  },
  scoreCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666688',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#FF7A00',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF7A00',
  },
  scoreCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scoreCardSubtitle: {
    marginTop: 6,
    marginLeft: 30,
    fontSize: 13,
    color: '#A0A0C0',
    fontWeight: '600',
  },
  scoreHint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#A0A0C0',
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#240D47',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A164D',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  notifyRowText: {
    flex: 1,
    paddingRight: 12,
  },
  notifyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notifySubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#A0A0C0',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    borderTopWidth: 1,
    borderTopColor: '#2A164D',
    backgroundColor: '#1A0836',
    zIndex: 2,
  },
  primaryButton: {
    flex: 1.2,
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(42, 22, 77, 0.85)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A164D',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  inputAccessory: {
    backgroundColor: '#2A164D',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A164D',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputAccessoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inputAccessoryButtonText: {
    color: '#FF7A00',
    fontWeight: '800',
    fontSize: 16,
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    zIndex: 50,
    elevation: 50,
  },
  pickerCard: {
    backgroundColor: '#1A0836',
    borderRadius: 18,
    maxHeight: '80%',
    paddingTop: 18,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    paddingHorizontal: 18,
  },
  pickerSubtitle: {
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 18,
    fontSize: 13,
    color: '#A0A0C0',
    lineHeight: 18,
  },
  searchInput: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A164D',
    backgroundColor: '#240D47',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#FFFFFF',
  },
  pickerList: {
    maxHeight: 320,
    paddingHorizontal: 8,
  },
  pickerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  pickerLoadingText: {
    color: '#A0A0C0',
    fontSize: 13,
  },
  pickerEmpty: {
    textAlign: 'center',
    color: '#666688',
    paddingVertical: 28,
    fontSize: 14,
  },
  pickerItem: {
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 10,
    marginHorizontal: 6,
  },
  pickerItemSelected: {
    backgroundColor: '#3D1E6D',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pickerItemTextSelected: {
    color: '#0F766E',
  },
  pickerCloseButton: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A164D',
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerCloseButtonText: {
    color: '#A0A0C0',
    fontWeight: '700',
    fontSize: 15,
  },
  pickerDoneButton: {
    marginTop: 8,
    backgroundColor: '#FF7A00',
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerDoneButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  paywallOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  paywallCard: {
    backgroundColor: '#1A0836',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2A164D',
  },
  paywallBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3D1E6D',
    color: '#FF7A00',
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  paywallTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  paywallBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: '#A0A0C0',
  },
  paywallFeatures: {
    marginTop: 16,
    gap: 6,
  },
  paywallFeature: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  paywallPrimaryButton: {
    marginTop: 20,
    backgroundColor: '#FF7A00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  paywallPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  paywallSecondaryButton: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  paywallSecondaryButtonText: {
    color: '#A0A0C0',
    fontWeight: '700',
    fontSize: 15,
  },
});
