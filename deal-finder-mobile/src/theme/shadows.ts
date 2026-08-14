import { Platform, ViewStyle } from 'react-native';

export const shadows = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#5B2DFF',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 4 },
    default: {},
  }),
  glow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#5B2DFF',
      shadowOpacity: 0.35,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 0 },
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const;
