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
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { getErrorMessage, notificationsApi } from '../../services/api';
import { colors, radii, spacing } from '../../theme';
import type { NotificationItem } from '../../types/models';
import type { MainStackParamList, MainTabParamList } from '../../types/navigation';

function channelLabel(channel: string): string {
  if (channel === 'PUSH') return 'Push';
  if (channel === 'TELEGRAM') return 'Telegram';
  if (channel === 'WHATSAPP') return 'WhatsApp';
  return channel;
}

function statusLabel(status: string): string {
  if (status === 'SENT') return 'Gönderildi';
  if (status === 'SKIPPED') return 'Atlandı';
  if (status === 'FAILED') return 'Başarısız';
  return status;
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
                  id: item.listingId,
                  dealId: item.listingId,
                })
              }
            >
              <View style={styles.thumb}>
                <DealListingImage uri={item.imageUrl} style={styles.thumbImage} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>
                  {channelLabel(item.channel)} · {statusLabel(item.status)}
                  {item.dealScore != null ? ` · Skor ${item.dealScore}` : ''}
                </Text>
                {item.status !== 'SENT' && item.reason ? (
                  <Text style={styles.reason}>{item.reason}</Text>
                ) : null}
                <Text style={styles.time}>
                  {new Date(item.sentAt || item.createdAt).toLocaleString('tr-TR')}
                </Text>
              </View>
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
  meta: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  reason: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  time: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
  },
});
