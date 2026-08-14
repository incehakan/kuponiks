import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type GlyphName =
  | 'flash'
  | 'search'
  | 'bell'
  | 'person'
  | 'person-circle'
  | 'back'
  | 'options'
  | 'add'
  | 'check'
  | 'help'
  | 'info'
  | 'logout'
  | 'devices'
  | 'chevron'
  | 'car'
  | 'image';

interface GlyphIconProps {
  name: GlyphName;
  color?: string;
  size?: number;
  focused?: boolean;
}

type IonName = React.ComponentProps<typeof Ionicons>['name'];

const ION: Record<GlyphName, IonName> = {
  flash: 'flash',
  search: 'search',
  bell: 'notifications',
  person: 'person',
  'person-circle': 'person-circle',
  back: 'chevron-back',
  options: 'options',
  add: 'add',
  check: 'checkmark',
  help: 'help-circle',
  info: 'information-circle',
  logout: 'log-out',
  devices: 'phone-portrait',
  chevron: 'chevron-forward',
  car: 'car-sport-outline',
  image: 'image-outline',
};

export default function GlyphIcon({
  name,
  color = '#FFFFFF',
  size = 20,
}: GlyphIconProps): React.JSX.Element {
  return <Ionicons name={ION[name]} size={size} color={color} />;
}
