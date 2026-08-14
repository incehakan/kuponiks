import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme';
import { toDisplayListingImageUrl } from '../utils/listingImage';

type ImageVariant = 'card' | 'detail' | 'thumb';

interface DealListingImageProps {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  variant?: ImageVariant;
  fallbackLabel?: string;
  icon?: 'car' | 'flash';
}

/**
 * Per-card listing photo. A failed URL never crashes the list.
 */
export default function DealListingImage({
  uri,
  style,
  variant = 'card',
  fallbackLabel = 'Fotoğraf yok',
  icon = 'car',
}: DealListingImageProps): React.JSX.Element {
  const displayUri = useMemo(() => toDisplayListingImageUrl(uri), [uri]);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'no-image'>(
    displayUri ? 'loading' : 'no-image',
  );

  useEffect(() => {
    setStatus(displayUri ? 'loading' : 'no-image');
  }, [displayUri]);

  const isDetail = variant === 'detail';
  const resizeMode = isDetail ? 'contain' : 'cover';
  const iconName = icon === 'flash' ? 'flash-outline' : 'car-sport-outline';
  const iconSize = variant === 'thumb' ? 22 : 36;

  if (!displayUri || status === 'error' || status === 'no-image') {
    return (
      <LinearGradient
        colors={['#1B0B35', '#120824', '#3A0CA3']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fallback, style]}
      >
        <Ionicons name={iconName} size={iconSize} color={colors.accent} />
        {variant !== 'thumb' ? (
          <Text style={styles.fallbackLabel}>{fallbackLabel}</Text>
        ) : null}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.frame, isDetail && styles.frameDetail, style]}>
      <Image
        source={{ uri: displayUri }}
        style={isDetail ? styles.imageContain : styles.imageCover}
        resizeMode={resizeMode}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
      {status === 'loading' ? (
        <View style={styles.loadingMask} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  frameDetail: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCover: {
    ...StyleSheet.absoluteFillObject,
  },
  imageContain: {
    width: '100%',
    height: '100%',
  },
  loadingMask: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 4, 20, 0.35)',
  },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  fallbackLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
