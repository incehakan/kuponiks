import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radii, spacing } from '../constants/theme';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  label: string;
  placeholder?: string;
  value: string | null;
  options: SelectOption[];
  loading?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  emptyText?: string;
  searchable?: boolean;
  clearable?: boolean;
  onSelect: (option: SelectOption | null) => void;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

/**
 * Reusable searchable single-select (modal list) for taxonomy / catalog fields.
 */
export default function SearchableSelect({
  label,
  placeholder = 'Seçin',
  value,
  options,
  loading = false,
  disabled = false,
  disabledHint,
  emptyText = 'Sonuç bulunamadı',
  searchable = true,
  clearable = true,
  onSelect,
}: SearchableSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (!value) {
      return null;
    }
    const hit = options.find((item) => item.value === value);
    return hit?.label ?? value;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) {
      return options;
    }
    return options.filter((item) =>
      normalizeSearch(`${item.label} ${item.value}`).includes(q),
    );
  }, [options, query]);

  const openModal = (): void => {
    if (disabled) {
      return;
    }
    setOpen(true);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={openModal}
        activeOpacity={disabled ? 1 : 0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
      >
        <Text
          style={[
            styles.triggerText,
            !selectedLabel && styles.placeholder,
          ]}
          numberOfLines={1}
        >
          {disabled && disabledHint
            ? disabledHint
            : selectedLabel ?? placeholder}
        </Text>
        {clearable && selectedLabel && !disabled ? (
          <TouchableOpacity
            onPress={() => onSelect(null)}
            hitSlop={10}
            accessibilityLabel={`${label} temizle`}
          >
            <Text style={styles.clear}>Temizle</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.chevron}>▼</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.close}>Kapat</Text>
              </TouchableOpacity>
            </View>

            {searchable ? (
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Ara..."
                placeholderTextColor={colors.placeholder}
                autoCorrect={false}
              />
            ) : null}

            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.empty}>{emptyText}</Text>
                }
                renderItem={({ item }) => {
                  const selected = item.value === value;
                  return (
                    <TouchableOpacity
                      style={[styles.row, selected && styles.rowSelected]}
                      onPress={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                    >
                      <Text style={styles.rowText}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  trigger: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  triggerDisabled: {
    opacity: 0.55,
  },
  triggerText: {
    color: colors.text,
    fontSize: 15,
    flex: 1,
  },
  placeholder: {
    color: colors.placeholder,
  },
  clear: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 10,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  close: {
    color: colors.primary,
    fontWeight: '600',
  },
  search: {
    margin: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  centered: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: {
    backgroundColor: 'rgba(255,122,0,0.12)',
  },
  rowText: {
    color: colors.text,
    fontSize: 15,
  },
});
