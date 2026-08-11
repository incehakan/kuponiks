export const colors = {
  background: '#12022B',
  backgroundAlt: '#1A0836',
  surface: '#1A0836',
  surfaceElevated: '#240D47',
  inputBg: '#240D47',
  inputBorder: '#3D1E6D',
  border: '#2A164D',
  divider: '#2A164D',

  primary: '#FF7A00',
  primaryHot: '#FF5500',
  secondary: '#8A2BE2',
  secondaryDeep: '#6C13D1',

  text: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#A0A0C0',
  textDim: '#666688',
  placeholder: '#666688',

  danger: '#EF4444',
  success: '#FF7A00',
  warning: '#FFC107',
  white: '#FFFFFF',
  black: '#000000',

  /** @deprecated use primary — kept for gradual migration */
  accent: '#FF7A00',
  accentHot: '#FF5500',
  accentWarm: '#FFC107',
  primarySoft: '#8A2BE2',
  primaryDeep: '#6C13D1',
} as const;

export const gradients = {
  primary: ['#FF7A00', '#8A2BE2'] as const,
  primaryReverse: ['#8A2BE2', '#FF7A00'] as const,
  primaryHot: ['#FF5500', '#6C13D1'] as const,
  hero: ['#12022B', '#1A0836', '#240D47'] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;
