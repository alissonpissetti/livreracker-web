import type { AccountDevice } from '../types';
import { recordedAtMs } from './recordedTime';

export type DevicePowerStatus = {
  percent: number | null;
  recordedAt: string;
  usbConnected: boolean;
  batteryCharging: boolean;
};

export type DevicePowerFields = Pick<
  AccountDevice,
  | 'last_battery_percent'
  | 'last_usb_connected'
  | 'last_battery_charging'
  | 'last_power_at'
>;

export const LIVE_POWER_STALE_MS = 20 * 60 * 1000;

function readingTimestampMs(iso: string): number {
  if (iso.includes('T')) {
    return new Date(iso).getTime();
  }
  return recordedAtMs(iso);
}

export function getDevicePowerStatus(
  device: DevicePowerFields | null | undefined,
): DevicePowerStatus | null {
  if (device?.last_power_at == null) {
    return null;
  }

  return {
    percent:
      device.last_battery_percent != null &&
      Number.isFinite(device.last_battery_percent)
        ? device.last_battery_percent
        : null,
    recordedAt: device.last_power_at,
    usbConnected: device.last_usb_connected ?? false,
    batteryCharging: device.last_battery_charging ?? false,
  };
}

/** @deprecated Use getDevicePowerStatus — mantido para compatibilidade interna. */
export function resolveDevicePowerStatus(
  device: DevicePowerFields | null | undefined,
): DevicePowerStatus | null {
  return getDevicePowerStatus(device);
}

export function isPowerStatusStale(
  status: DevicePowerStatus | null,
  nowMs: number = Date.now(),
  staleMs: number = LIVE_POWER_STALE_MS,
): boolean {
  if (!status?.recordedAt) {
    return true;
  }

  return nowMs - readingTimestampMs(status.recordedAt) > staleMs;
}
