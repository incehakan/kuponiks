import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { colors } from '../theme';
import { toDisplayListingImageUrl } from '../utils/listingImage';

interface DealListingImageProps {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
}

/**
 * Per-card listing photo. A failed URL never crashes the list.
 */
export default function DealListingImage({
  uri,
  style,
}: DealListingImageProps): React.JSX.Element {
  const displayUri = useMemo(() => toDisplayListingImageUrl(uri), [uri]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [displayUri]);

  if (!displayUri || failed) {
    return <View style={[styles.fallback, style]} />;
  }

  return (
    <Image
      source={{ uri: displayUri }}
      style={[styles.image, style]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
  },
});
