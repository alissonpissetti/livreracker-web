export const DEVICE_ICONS = [
  'vehicle',
  'car',
  'bicycle',
  'truck',
  'boat',
  'plane',
  'scooter',
  'backpack',
] as const;

export type DeviceIcon = (typeof DEVICE_ICONS)[number];

export const DEFAULT_DEVICE_ICON: DeviceIcon = 'vehicle';

export const DEVICE_ICON_OPTIONS: Array<{
  id: DeviceIcon;
  label: string;
}> = [
  { id: 'vehicle', label: 'Veículo' },
  { id: 'car', label: 'Carro' },
  { id: 'bicycle', label: 'Bicicleta' },
  { id: 'truck', label: 'Caminhão' },
  { id: 'boat', label: 'Barco' },
  { id: 'plane', label: 'Avião' },
  { id: 'scooter', label: 'Patinete' },
  { id: 'backpack', label: 'Mochila' },
];

export function isDeviceIcon(value: string): value is DeviceIcon {
  return (DEVICE_ICONS as readonly string[]).includes(value);
}
