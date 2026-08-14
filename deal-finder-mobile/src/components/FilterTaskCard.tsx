import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { colors, radii, spacing } from '../theme';
import type { Filter } from '../types/models';
import {
  formatFilterSummary,
  formatFilterTaskTitle,
} from '../utils/filterForm';

interface FilterTaskCardProps {
  filter: Filter;
  isToggling?: boolean;
  isDeleting?: boolean;
  onPress: (filter: Filter) => void;
  onToggle: (filter: Filter) => void;
  onDelete: (filter: Filter) => void;
}

export default function FilterTaskCard({
  filter,
  isToggling = false,
  isDeleting = false,
  onPress,
  onToggle,
  onDelete,
}: FilterTaskCardProps): React.JSX.Element {
  const isActive = filter.isActive !== false;
  const summary = formatFilterSummary(filter);

  return (
    <Pressable
      onPress={() => onPress(filter)}
      style={[styles.card, !isActive && styles.inactive]}
      accessibilityRole="button"
    >
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={styles.title}>{formatFilterTaskTitle(filter)}</Text>
          <Text style={styles.category}>{filter.category}</Text>
          <Text style={styles.meta}>{summary}</Text>
        </View>
        {isToggling ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Switch
            value={isActive}
            onValueChange={() => onToggle(filter)}
            trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
            thumbColor={isActive ? colors.accent : colors.textMuted}
            accessibilityLabel={isActive ? 'Aktif' : 'Pasif'}
          />
        )}
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.edit} onPress={() => onPress(filter)}>
          <Text style={styles.editText}>Düzenle</Text>
        </Pressable>
        <Pressable
          style={styles.delete}
          onPress={() => onDelete(filter)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.deleteText}>Sil</Text>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inactive: {
    opacity: 0.72,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  category: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
  },
  meta: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  edit: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  delete: {
    minWidth: 72,
    minHeight: 40,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  deleteText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
});
