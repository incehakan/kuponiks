import React, { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import DealListingImage from './DealListingImage';
import DealScoreBadge from './DealScoreBadge';
import PriceAdvantageBadge from './PriceAdvantageBadge';
import { colors, radii, spacing } from '../theme';
import type { Deal } from '../types/models';
import {
  dealHeadline,
  dealLocation,
  dealSpecLine,
  marketMedian,
  marketSourceCount,
  resolveSourceLabel,
} from '../utils/dealDisplay';
import { formatTry } from '../utils/formatDeal';

interface DealCardProps {
  deal: Deal;
  highlighted?: boolean;
  onPress: (deal: Deal) => void;
}

function DealCard({
  deal,
  highlighted = false,
  onPress,
}: DealCardProps): React.JSX.Element {
  const title = dealHeadline(deal);
  const spec = dealSpecLine(deal);
  const location = dealLocation(deal);
  const median = marketMedian(deal);
  const platform = resolveSourceLabel(deal);
  const advantagePct = deal.priceAdvantagePct ?? deal.dealPercent;
  const sources = marketSourceCount(deal);

  return (
    <Pressable
      onPress={() => onPress(deal)}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.highlighted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.media} collapsable={false}>
        <DealListingImage
          uri={deal.imageUrl}
          style={styles.image}
          variant="card"
          fallbackLabel="Fotoğraf yok"
        />
        <View style={styles.scoreWrap}>
          <DealScoreBadge score={deal.dealScore} size="sm" />
        </View>
        <View style={styles.advantageWrap}>
          <PriceAdvantageBadge pct={advantagePct} />
        </View>
        {sources != null && sources >= 2 ? (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{sources} kaynak</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {deal.trim ? (
          <Text style={styles.trim} numberOfLines={1}>
            {deal.trim}
          </Text>
        ) : null}
        {spec ? (
          <Text style={styles.meta} numberOfLines={1}>
            {spec}
          </Text>
        ) : null}
        {location ? (
          <Text style={styles.meta} numberOfLines={1}>
            {location}
          </Text>
        ) : null}

        <View style={styles.priceRow}>
          <View>
            <Text style={styles.price}>{formatTry(deal.price)}</Text>
            {median != null ? (
              <Text style={styles.median}>{formatTry(median)}</Text>
            ) : null}
          </View>
          {platform ? <Text style={styles.platform}>{platform}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export default memo(DealCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  highlighted: {
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.92,
  },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  scoreWrap: {
    position: 'absolute',
    left: 12,
    bottom: 12,
  },
  advantageWrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
  },
  sourceBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: 'rgba(8,4,20,0.72)',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sourceBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  trim: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  meta: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
  },
  priceRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  price: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  median: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  platform: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
