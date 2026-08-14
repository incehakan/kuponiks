import { TextStyle } from 'react-native';

import { colors } from './colors';

export const typography = {
  display: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.6,
  } satisfies TextStyle,
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  } satisfies TextStyle,
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  } satisfies TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 22,
  } satisfies TextStyle,
  caption: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 18,
  } satisfies TextStyle,
  button: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.2,
  } satisfies TextStyle,
  score: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  } satisfies TextStyle,
} as const;
