import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import DealListingImage from '../../components/DealListingImage';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import GlyphIcon from '../../components/GlyphIcon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { getErrorMessage, notificationsApi } from '../../services/api';
import { colors, radii, spacing } from '../../theme';
import type { NotificationItem } from '../../types/models';
import type { MainStackParamList, MainTabParamList } from '../../types/navigation';
import { formatRelativeTimeTr } from '../../utils/formatRelativeTime';

function formatAdvantage(pct: number | null | undefined): string | null {
  if (pct == null || Number.isNaN(Number(pct))) {
    return null;
  }
  const value = Number(pct);
  const formatted = Math.abs(value).toLocaleString('tr-TR', {
    maximumFractionDigits: 1,
  });
  if (value > 0) {
    return `%${formatted} daha ucuz`;
  }
  if (value < 0) {
    return `%${formatted} piyasa üstü`;
  }
  return null;
}

function metaLine(item: NotificationItem): string {
  const parts: string[] = [];
  if (item.dealScore != null) {
    parts.push(`Skor ${item.dealScore}`);
  }
  const advantage = formatAdvantage(item.priceAdvantagePct);
  if (advantage) {
    parts.push(advantage);
  }
  return parts.join(' · ');
}

function footerLine(item: NotificationItem): string {
  const when = formatRelativeTimeTr(item.createdAt || item.sentAt);
  return [item.platform, when].filter(Boolean).join(' · ');
}

export default function NotificationsScreen(): React.JSX.Element {
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParamList, 'Notifications'>,
        NativeStackNavigationProp<MainStackParamList>
      >
    >();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false): Promise<void> => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await notificationsApi.getNotifications();
      setItems(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Bildirimler alınamadı.'));
      if (!refresh) {
        setItems([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Bildirimler</Text>
      {loading && items.length === 0 ? (
        <LoadingSkeleton rows={3} />
      ) : error && items.length === 0 ? (
        <ErrorState subtitle={error} onRetry={() => void load()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            items.length === 0 ? styles.emptyContent : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="Henüz bildiriminiz yok"
              subtitle="Eşleşen fırsatlar geldiğinde gönderilen kayıtlar burada görünür."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate('DealDetail', {
                  id: item.dealId || item.listingId,
                  dealId: item.dealId || item.listingId,
                })
              }
            >
              <View style={styles.thumb}>
                <DealListingImage
                  uri={item.imageUrl}
                  style={styles.thumbImage}
                  variant="thumb"
                  icon="flash"
                />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.message ? (
                  <Text style={styles.message} numberOfLines={2}>
                    {item.message}
                  </Text>
                ) : null}
                {metaLine(item) ? (
                  <Text style={styles.meta}>{metaLine(item)}</Text>
                ) : null}
                <Text style={styles.time}>{footerLine(item)}</Text>
              </View>
              <GlyphIcon name="chevron" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  emptyContent: {
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  thumbImage: {
    width: 72,
    height: 72,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
  message: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  meta: {
    marginTop: 4,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  time: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
  },
});
