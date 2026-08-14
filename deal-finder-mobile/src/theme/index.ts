export { colors } from './colors';
export { spacing } from './spacing';
export { radii } from './radius';
export { typography } from './typography';
export { shadows } from './shadows';

export const gradients = {
  primary: ['#5B2DFF', '#3A0CA3'] as const,
  primaryReverse: ['#3A0CA3', '#5B2DFF'] as const,
  primaryHot: ['#FF8A00', '#5B2DFF'] as const,
  hero: ['#080414', '#0B0618', '#120824'] as const,
  premium: ['#3A0CA3', '#5B2DFF'] as const,
} as const;
