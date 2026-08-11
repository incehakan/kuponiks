import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
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

import SearchableSelect, {
  type SelectOption,
} from './SearchableSelect';
import { colors, radii, spacing } from '../constants/theme';
import {
  catalogApi,
  filtersApi,
  getErrorMessage,
  getHttpStatus,
  taxonomyApi,
} from '../services/api';
import type {
  CityItem,
  CreateFilterPayload,
  Filter,
  TaxonomyItem,
} from '../types/models';
import {
  FILTER_CATEGORY_OPTIONS,
  isRealEstateCategory,
  isVehicleCategory,
  parseOptionalInt,
  splitKeywordInput,
} from '../utils/filterForm';

interface DealScoreOption {
  score: number;
  title: string;
  subtitle: string;
}

const DEAL_SCORE_OPTIONS: DealScoreOption[] = [
  { score: 50, title: 'Skor 50+', subtitle: 'Daha geniş fırsat ağı' },
  { score: 70, title: 'Skor 70+', subtitle: 'İyi fırsat' },
  { score: 80, title: 'Skor 80+', subtitle: 'Kelepir' },
  { score: 90, title: 'Skor 90+', subtitle: 'Süper kelepir' },
];

const FALLBACK_CITIES: CityItem[] = [
  { id: '00', name: 'Tüm Türkiye' },
  { id: '34', name: 'İstanbul' },
  { id: '06', name: 'Ankara' },
  { id: '35', name: 'İzmir' },
  { id: '16', name: 'Bursa' },
  { id: '07', name: 'Antalya' },
];

const ACCESSORY_ID = 'filter-form-accessory';

export interface FilterFormState {
  name: string;
  categoryPath: string;
  brand: string | null;
  series: string | null;
  trim: string | null;
  minYear: string;
  maxYear: string;
  minMileage: string;
  maxMileage: string;
  minPrice: string;
  maxPrice: string;
  city: string | null;
  district: string | null;
  fuelType: string | null;
  transmission: string | null;
  sellerType: string | null;
  keywords: string;
  excludedKeywords: string;
  minDealScore: number;
  isActive: boolean;
  notifyPush: boolean;
  notifyTelegram: boolean;
  notifyWhatsapp: boolean;
}

const INITIAL_FORM: FilterFormState = {
  name: '',
  categoryPath: '',
  brand: null,
  series: null,
  trim: null,
  minYear: '',
  maxYear: '',
  minMileage: '',
  maxMileage: '',
  minPrice: '',
  maxPrice: '',
  city: null,
  district: null,
  fuelType: null,
  transmission: null,
  sellerType: null,
  keywords: '',
  excludedKeywords: '',
  minDealScore: 70,
  isActive: true,
  notifyPush: true,
  notifyTelegram: false,
  notifyWhatsapp: false,
};

function toTaxonomyOptions(items: TaxonomyItem[]): SelectOption[] {
  return items.map((item) => ({ value: item.value, label: item.label }));
}

function filterToForm(filter: Filter): FilterFormState {
  return {
    name: filter.name ?? '',
    categoryPath: filter.category ?? '',
    brand: filter.brand ?? null,
    series: filter.series ?? null,
    trim: filter.trim ?? null,
    minYear: filter.minYear != null ? String(filter.minYear) : '',
    maxYear: filter.maxYear != null ? String(filter.maxYear) : '',
    minMileage: filter.minMileage != null ? String(filter.minMileage) : '',
    maxMileage: filter.maxMileage != null ? String(filter.maxMileage) : '',
    minPrice: filter.minPrice != null ? String(Math.round(filter.minPrice)) : '',
    maxPrice: filter.maxPrice != null ? String(Math.round(filter.maxPrice)) : '',
    city: filter.city?.split(',')[0]?.trim() || null,
    district: filter.district ?? null,
    fuelType: filter.fuelType ?? null,
    transmission: filter.transmission ?? null,
    sellerType: filter.sellerType ?? null,
    keywords: Array.isArray(filter.keywords) ? filter.keywords.join(', ') : '',
    excludedKeywords: Array.isArray(filter.excludedKeywords)
      ? filter.excludedKeywords.join(', ')
      : '',
    minDealScore: filter.minDealScore ?? 70,
    isActive: filter.isActive !== false,
    notifyPush: filter.notifyPush !== false,
    notifyTelegram: filter.notifyTelegram === true,
    notifyWhatsapp: filter.notifyWhatsapp === true,
  };
}

interface FilterFormModalProps {
  visible: boolean;
  editingFilter: Filter | null;
  subscriptionPlan: 'FREE' | 'PRO' | 'VIP';
  onClose: () => void;
  onSaved: (filter: Filter) => void;
  onNeedUpgrade: (
    target: 'PRO' | 'VIP',
    reason: 'filter-limit' | 'telegram' | 'whatsapp',
  ) => void;
}

export default function FilterFormModal({
  visible,
  editingFilter,
  subscriptionPlan,
  onClose,
  onSaved,
  onNeedUpgrade,
}: FilterFormModalProps): React.JSX.Element {
  const [form, setForm] = useState<FilterFormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cities, setCities] = useState<CityItem[]>(FALLBACK_CITIES);
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [series, setSeries] = useState<SelectOption[]>([]);
  const [trims, setTrims] = useState<SelectOption[]>([]);
  const [fuelTypes, setFuelTypes] = useState<SelectOption[]>([]);
  const [transmissions, setTransmissions] = useState<SelectOption[]>([]);
  const [sellerTypes, setSellerTypes] = useState<SelectOption[]>([]);
  const [districts, setDistricts] = useState<SelectOption[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTrims, setLoadingTrims] = useState(false);
  const [loadingExtras, setLoadingExtras] = useState(false);

  const isVehicle = isVehicleCategory(form.categoryPath);
  const isRealEstate = isRealEstateCategory(form.categoryPath);
  const categoryOptions: SelectOption[] = useMemo(
    () =>
      FILTER_CATEGORY_OPTIONS.map((item) => ({
        value: item.value,
        label: item.label,
      })),
    [],
  );
  const cityOptions: SelectOption[] = useMemo(
    () => cities.map((c) => ({ value: c.name, label: c.name })),
    [cities],
  );

  const loadCatalog = useCallback(async (): Promise<void> => {
    try {
      const nextCities = await catalogApi.getCities(true);
      if (nextCities.length > 0) {
        setCities(nextCities);
      }
    } catch {
      setCities(FALLBACK_CITIES);
    }
  }, []);

  const loadVehicleExtras = useCallback(async (): Promise<void> => {
    setLoadingExtras(true);
    try {
      const [fuels, gears, sellers] = await Promise.all([
        taxonomyApi.getVehicleFuelTypes(),
        taxonomyApi.getVehicleTransmissions(),
        taxonomyApi.getVehicleSellerTypes(),
      ]);
      setFuelTypes(toTaxonomyOptions(fuels));
      setTransmissions(toTaxonomyOptions(gears));
      setSellerTypes(toTaxonomyOptions(sellers));
    } catch {
      setFuelTypes([]);
      setTransmissions([]);
      setSellerTypes([]);
    } finally {
      setLoadingExtras(false);
    }
  }, []);

  const loadBrands = useCallback(async (): Promise<void> => {
    setLoadingBrands(true);
    try {
      setBrands(toTaxonomyOptions(await taxonomyApi.getVehicleBrands()));
    } catch {
      setBrands([]);
    } finally {
      setLoadingBrands(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setForm(editingFilter ? filterToForm(editingFilter) : INITIAL_FORM);
    void loadCatalog();
  }, [visible, editingFilter, loadCatalog]);

  useEffect(() => {
    if (!visible || !isVehicle) {
      return;
    }
    void loadBrands();
    void loadVehicleExtras();
  }, [visible, isVehicle, loadBrands, loadVehicleExtras]);

  useEffect(() => {
    if (!visible || !isVehicle || !form.brand) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingSeries(true);
    void taxonomyApi
      .getVehicleSeries(form.brand)
      .then((items) => {
        if (!cancelled) {
          setSeries(toTaxonomyOptions(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSeries([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSeries(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, isVehicle, form.brand]);

  useEffect(() => {
    if (!visible || !isVehicle || !form.brand || !form.series) {
      setTrims([]);
      return;
    }
    let cancelled = false;
    setLoadingTrims(true);
    void taxonomyApi
      .getVehicleTrims(form.brand, form.series)
      .then((items) => {
        if (!cancelled) {
          setTrims(toTaxonomyOptions(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrims([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTrims(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, isVehicle, form.brand, form.series]);

  useEffect(() => {
    if (!visible || !form.city || form.city === 'Tüm Türkiye') {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    void taxonomyApi
      .getDistricts(form.city)
      .then((items) => {
        if (!cancelled) {
          setDistricts(toTaxonomyOptions(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDistricts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, form.city]);

  const setCategory = (option: SelectOption | null): void => {
    setForm((prev) => ({
      ...INITIAL_FORM,
      name: prev.name,
      categoryPath: option?.value ?? '',
      minDealScore: prev.minDealScore,
      notifyPush: prev.notifyPush,
      notifyTelegram: prev.notifyTelegram,
      notifyWhatsapp: prev.notifyWhatsapp,
      isActive: prev.isActive,
    }));
  };

  const setBrand = (option: SelectOption | null): void => {
    setForm((prev) => ({
      ...prev,
      brand: option?.value ?? null,
      series: null,
      trim: null,
    }));
  };

  const setSeriesValue = (option: SelectOption | null): void => {
    setForm((prev) => ({
      ...prev,
      series: option?.value ?? null,
      trim: null,
    }));
  };

  const handleClose = (): void => {
    if (isSubmitting) {
      return;
    }
    Keyboard.dismiss();
    onClose();
  };

  const handleSave = async (): Promise<void> => {
    const category = form.categoryPath.trim();
    if (!category) {
      Alert.alert('Eksik bilgi', 'Lütfen bir kategori seçin.');
      return;
    }

    const minYear = parseOptionalInt(form.minYear);
    const maxYear = parseOptionalInt(form.maxYear);
    const minMileage = parseOptionalInt(form.minMileage);
    const maxMileage = parseOptionalInt(form.maxMileage);
    const minPrice = parseOptionalInt(form.minPrice);
    const maxPrice = parseOptionalInt(form.maxPrice);

    for (const [label, value] of [
      ['Minimum yıl', minYear],
      ['Maksimum yıl', maxYear],
      ['Minimum kilometre', minMileage],
      ['Maksimum kilometre', maxMileage],
      ['Minimum fiyat', minPrice],
      ['Maksimum fiyat', maxPrice],
    ] as const) {
      if (value !== undefined && Number.isNaN(value)) {
        Alert.alert('Geçersiz değer', `${label} için geçerli bir sayı girin.`);
        return;
      }
    }

    const currentYear = new Date().getFullYear() + 1;
    if (
      (minYear != null && (minYear < 1900 || minYear > currentYear)) ||
      (maxYear != null && (maxYear < 1900 || maxYear > currentYear))
    ) {
      Alert.alert(
        'Geçersiz yıl',
        `Model yılı 1900 ile ${currentYear} arasında olmalıdır.`,
      );
      return;
    }

    if (minYear != null && maxYear != null && minYear > maxYear) {
      Alert.alert('Geçersiz yıl', 'Minimum yıl, maksimum yıldan büyük olamaz.');
      return;
    }
    if (minMileage != null && maxMileage != null && minMileage > maxMileage) {
      Alert.alert(
        'Geçersiz kilometre',
        'Minimum kilometre, maksimumtan büyük olamaz.',
      );
      return;
    }
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      Alert.alert('Geçersiz fiyat', 'Minimum fiyat, maksimumtan büyük olamaz.');
      return;
    }

    if (!form.city) {
      Alert.alert('Eksik bilgi', 'Lütfen bir şehir seçin.');
      return;
    }

    const vehicle = isVehicleCategory(category);
    const subcategory = category.includes('>')
      ? category.split('>').pop()?.trim()
      : undefined;

    const payload: CreateFilterPayload = {
      category,
      name: form.name.trim() || null,
      city: form.city === 'Tüm Türkiye' ? form.city : form.city,
      minDealScore: form.minDealScore,
      isActive: form.isActive,
      notifyPush: form.notifyPush,
      notifyTelegram: form.notifyTelegram,
      notifyWhatsapp: form.notifyWhatsapp,
      keywords: splitKeywordInput(form.keywords),
      excludedKeywords: splitKeywordInput(form.excludedKeywords),
      ...(subcategory ? { subcategory } : {}),
      ...(minPrice != null ? { minPrice } : {}),
      ...(maxPrice != null ? { maxPrice } : {}),
      ...(form.district ? { district: form.district } : { district: null }),
      ...(vehicle
        ? {
            brand: form.brand,
            series: form.series,
            trim: form.trim,
            fuelType: form.fuelType,
            transmission: form.transmission,
            sellerType: form.sellerType,
            ...(minYear != null ? { minYear } : { minYear: null }),
            ...(maxYear != null ? { maxYear } : { maxYear: null }),
            ...(minMileage != null ? { minMileage } : { minMileage: null }),
            ...(maxMileage != null ? { maxMileage } : { maxMileage: null }),
          }
        : {
            brand: null,
            series: null,
            trim: null,
            fuelType: null,
            transmission: null,
            sellerType: null,
            minYear: null,
            maxYear: null,
            minMileage: null,
            maxMileage: null,
          }),
    };

    setIsSubmitting(true);
    try {
      const saved = editingFilter
        ? await filtersApi.updateFilter(editingFilter.id, payload)
        : await filtersApi.createFilter(payload);
      onSaved(saved);
      Alert.alert(
        'Başarılı',
        editingFilter
          ? 'Arama görevi güncellendi.'
          : 'Yeni arama görevi oluşturuldu.',
      );
    } catch (error) {
      if (getHttpStatus(error) === 403 && !editingFilter) {
        onNeedUpgrade('PRO', 'filter-limit');
        return;
      }
      Alert.alert(
        editingFilter ? 'Güncellenemedi' : 'Kaydedilemedi',
        getErrorMessage(
          error,
          'Arama görevi kaydedilirken bir hata oluştu.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {editingFilter ? 'Görevi Düzenle' : 'Yeni Arama Görevi'}
              </Text>
              <TouchableOpacity onPress={handleClose} disabled={isSubmitting}>
                <Text style={styles.close}>Kapat</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.section}>Ne arıyorsun?</Text>
              <Text style={styles.label}>Görev adı</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder="Örn: Honda Civic Fırsatları"
                placeholderTextColor={colors.placeholder}
              />
              <SearchableSelect
                label="Kategori"
                placeholder="Kategori seçin"
                value={form.categoryPath || null}
                options={categoryOptions}
                onSelect={setCategory}
                searchable
              />

              {isVehicle ? (
                <>
                  <Text style={styles.section}>Araç bilgileri</Text>
                  <SearchableSelect
                    label="Marka"
                    placeholder="Marka seçin"
                    value={form.brand}
                    options={brands}
                    loading={loadingBrands}
                    emptyText="Henüz marka verisi yok"
                    onSelect={setBrand}
                  />
                  <SearchableSelect
                    label="Seri"
                    placeholder="Seri seçin"
                    value={form.series}
                    options={series}
                    loading={loadingSeries}
                    disabled={!form.brand}
                    disabledHint="Önce marka seçin"
                    emptyText="Bu marka için seri bulunamadı"
                    onSelect={setSeriesValue}
                  />
                  <SearchableSelect
                    label="Versiyon / Paket"
                    placeholder="Tüm versiyonlar (opsiyonel)"
                    value={form.trim}
                    options={trims}
                    loading={loadingTrims}
                    disabled={!form.series}
                    disabledHint="Önce seri seçin"
                    emptyText="Bu seri için versiyon bulunamadı"
                    clearable
                    onSelect={(option) =>
                      setForm((prev) => ({
                        ...prev,
                        trim: option?.value ?? null,
                      }))
                    }
                  />

                  <Text style={styles.section}>Bütçe ve kullanım</Text>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={styles.label}>Min. model yılı</Text>
                      <TextInput
                        style={styles.input}
                        value={form.minYear}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            minYear: v.replace(/[^0-9]/g, ''),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="2018"
                        placeholderTextColor={colors.placeholder}
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? ACCESSORY_ID : undefined
                        }
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={styles.label}>Max. model yılı</Text>
                      <TextInput
                        style={styles.input}
                        value={form.maxYear}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            maxYear: v.replace(/[^0-9]/g, ''),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="2022"
                        placeholderTextColor={colors.placeholder}
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? ACCESSORY_ID : undefined
                        }
                      />
                    </View>
                  </View>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={styles.label}>Min. kilometre</Text>
                      <TextInput
                        style={styles.input}
                        value={form.minMileage}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            minMileage: v.replace(/[^0-9]/g, ''),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.placeholder}
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? ACCESSORY_ID : undefined
                        }
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={styles.label}>Max. kilometre</Text>
                      <TextInput
                        style={styles.input}
                        value={form.maxMileage}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            maxMileage: v.replace(/[^0-9]/g, ''),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="120000"
                        placeholderTextColor={colors.placeholder}
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? ACCESSORY_ID : undefined
                        }
                      />
                    </View>
                  </View>

                  {fuelTypes.length > 0 ? (
                    <SearchableSelect
                      label="Yakıt"
                      placeholder="Tümü"
                      value={form.fuelType}
                      options={fuelTypes}
                      loading={loadingExtras}
                      onSelect={(option) =>
                        setForm((p) => ({
                          ...p,
                          fuelType: option?.value ?? null,
                        }))
                      }
                    />
                  ) : null}
                  {transmissions.length > 0 ? (
                    <SearchableSelect
                      label="Vites"
                      placeholder="Tümü"
                      value={form.transmission}
                      options={transmissions}
                      loading={loadingExtras}
                      onSelect={(option) =>
                        setForm((p) => ({
                          ...p,
                          transmission: option?.value ?? null,
                        }))
                      }
                    />
                  ) : null}
                  {sellerTypes.length > 0 ? (
                    <SearchableSelect
                      label="Satıcı"
                      placeholder="Tümü"
                      value={form.sellerType}
                      options={sellerTypes}
                      loading={loadingExtras}
                      onSelect={(option) =>
                        setForm((p) => ({
                          ...p,
                          sellerType: option?.value ?? null,
                        }))
                      }
                    />
                  ) : null}
                </>
              ) : null}

              {(isVehicle || isRealEstate || form.categoryPath) && (
                <>
                  <Text style={styles.section}>Konum ve fiyat</Text>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={styles.label}>Min. fiyat</Text>
                      <TextInput
                        style={styles.input}
                        value={form.minPrice}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            minPrice: v.replace(/[^0-9]/g, ''),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.placeholder}
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? ACCESSORY_ID : undefined
                        }
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={styles.label}>Max. fiyat</Text>
                      <TextInput
                        style={styles.input}
                        value={form.maxPrice}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            maxPrice: v.replace(/[^0-9]/g, ''),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="1500000"
                        placeholderTextColor={colors.placeholder}
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? ACCESSORY_ID : undefined
                        }
                      />
                    </View>
                  </View>

                  <SearchableSelect
                    label="Şehir"
                    placeholder="Şehir seçin"
                    value={form.city}
                    options={cityOptions}
                    onSelect={(option) =>
                      setForm((p) => ({
                        ...p,
                        city: option?.value ?? null,
                        district: null,
                      }))
                    }
                  />
                  {districts.length > 0 ? (
                    <SearchableSelect
                      label="İlçe"
                      placeholder="İlçe (opsiyonel)"
                      value={form.district}
                      options={districts}
                      onSelect={(option) =>
                        setForm((p) => ({
                          ...p,
                          district: option?.value ?? null,
                        }))
                      }
                    />
                  ) : null}
                </>
              )}

              <Text style={styles.section}>Fırsat kriteri</Text>
              <Text style={styles.hint}>
                Bu eşik yalnızca sizin arama göreviniz içindir. Genel sistem eşiğinden
                bağımsızdır.
              </Text>
              {DEAL_SCORE_OPTIONS.map((option) => {
                const selected = form.minDealScore === option.score;
                return (
                  <TouchableOpacity
                    key={option.score}
                    style={[styles.scoreCard, selected && styles.scoreSelected]}
                    onPress={() =>
                      setForm((p) => ({ ...p, minDealScore: option.score }))
                    }
                  >
                    <Text style={styles.scoreTitle}>{option.title}</Text>
                    <Text style={styles.scoreSub}>{option.subtitle}</Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.section}>Kelime filtreleri</Text>
              <Text style={styles.label}>Anahtar kelimeler</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.keywords}
                onChangeText={(v) => setForm((p) => ({ ...p, keywords: v }))}
                placeholder="hatasız, boyasız"
                placeholderTextColor={colors.placeholder}
                multiline
              />
              <Text style={styles.label}>Hariç tutulacak kelimeler</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.excludedKeywords}
                onChangeText={(v) =>
                  setForm((p) => ({ ...p, excludedKeywords: v }))
                }
                placeholder="ağır hasarlı, pert"
                placeholderTextColor={colors.placeholder}
                multiline
              />

              <View style={styles.switchRow}>
                <Text style={styles.label}>Aktif</Text>
                <Switch
                  value={form.isActive}
                  onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                  trackColor={{ false: colors.border, true: colors.secondary }}
                  thumbColor={form.isActive ? colors.primary : colors.textDim}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.label}>Push bildirimi</Text>
                <Switch
                  value={form.notifyPush}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, notifyPush: v }))
                  }
                  trackColor={{ false: colors.border, true: colors.secondary }}
                  thumbColor={form.notifyPush ? colors.primary : colors.textDim}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.label}>Telegram</Text>
                <Switch
                  value={form.notifyTelegram}
                  onValueChange={(v) => {
                    if (v && subscriptionPlan === 'FREE') {
                      onNeedUpgrade('PRO', 'telegram');
                      return;
                    }
                    setForm((p) => ({ ...p, notifyTelegram: v }));
                  }}
                  trackColor={{ false: colors.border, true: colors.secondary }}
                  thumbColor={
                    form.notifyTelegram ? colors.primary : colors.textDim
                  }
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, isSubmitting && styles.saveDisabled]}
              onPress={() => void handleSave()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>
                  {editingFilter ? 'Güncelle' : 'Arama Görevini Kaydet'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessory}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={styles.accessoryText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  keyboard: { flex: 1, justifyContent: 'flex-end' },
  card: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  close: { color: colors.primary, fontWeight: '700' },
  scroll: { maxHeight: '78%' },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    fontSize: 15,
    minHeight: 48,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  scoreCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceElevated,
  },
  scoreSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,122,0,0.12)',
  },
  scoreTitle: { color: colors.text, fontWeight: '700' },
  scoreSub: { color: colors.textMuted, marginTop: 4, fontSize: 12 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  saveBtn: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.7 },
  saveText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  accessory: {
    backgroundColor: colors.surfaceElevated,
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  accessoryText: { color: colors.primary, fontWeight: '700' },
});
