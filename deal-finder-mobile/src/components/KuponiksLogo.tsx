import React from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type ViewStyle } from 'react-native';

import { APP_NAME, APP_TAGLINE } from '../constants/brand';
import { colors, typography } from '../theme';

interface KuponiksLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  showTagline?: boolean;
  style?: ViewStyle;
}

const SIZES = {
  sm: { logo: 36, wordmark: 18 },
  md: { logo: 72, wordmark: 28 },
  lg: { logo: 120, wordmark: 36 },
};

export default function KuponiksLogo({
  size = 'md',
  showWordmark = true,
  showTagline = false,
  style,
}: KuponiksLogoProps): React.JSX.Element {
  const dim = SIZES[size];
  const logoStyle: ImageStyle = {
    width: dim.logo,
    height: dim.logo,
    borderRadius: dim.logo / 2,
    backgroundColor: colors.primaryDark,
    overflow: 'hidden',
  };

  return (
    <View style={[styles.wrap, size === 'sm' && styles.wrapRow, style]}>
      <Image
        source={require('../../assets/icon.png')}
        style={logoStyle}
        resizeMode="contain"
        accessibilityLabel="Kuponiks"
      />
      {showWordmark ? (
        <Text
          style={[
            styles.wordmark,
            { fontSize: dim.wordmark },
            size === 'sm' && styles.wordmarkSm,
          ]}
        >
          {APP_NAME}
        </Text>
      ) : null}
      {showTagline ? <Text style={styles.tagline}>{APP_TAGLINE}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  wrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    ...typography.title,
    marginTop: 8,
  },
  wordmarkSm: {
    marginTop: 0,
  },
  tagline: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: colors.accent,
  },
});
