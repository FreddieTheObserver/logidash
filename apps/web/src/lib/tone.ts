import type {
  DeliveryDtoStatus,
  DriverDtoAvailability,
  DeliveryDtoPriority,
} from '@logidash/api-client';
import type { DeadlineState } from './format';

export type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'primary';

/** fg/bg pairs for a tone, as CSS-var strings (used inline for dynamic tints). */
export const TONE: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: 'var(--color-success)', bg: 'var(--tint-success)' },
  warning: { fg: 'var(--color-warning)', bg: 'var(--tint-warning)' },
  danger: { fg: 'var(--color-danger)', bg: 'var(--tint-danger)' },
  info: { fg: 'var(--color-info)', bg: 'var(--tint-info)' },
  neutral: { fg: 'var(--color-neutral)', bg: 'var(--tint-neutral)' },
  primary: { fg: 'var(--color-primary)', bg: 'var(--tint-primary)' },
};

export const DELIVERY_TONE: Record<DeliveryDtoStatus, Tone> = {
  draft: 'neutral',
  ready: 'info',
  assigned: 'primary',
  picked_up: 'info',
  in_transit: 'info',
  delivered: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export const DELIVERY_LABEL: Record<DeliveryDtoStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  assigned: 'Assigned',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const AVAIL_TONE: Record<DriverDtoAvailability, Tone> = {
  available: 'success',
  busy: 'warning',
  offline: 'neutral',
};

export const PRIORITY_TONE: Record<DeliveryDtoPriority, Tone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};

export const SLA_TONE: Record<DeadlineState, Tone> = {
  'on-track': 'success',
  'at-risk': 'warning',
  breached: 'danger',
};

export const SLA_LABEL: Record<DeadlineState, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  breached: 'Breached',
};

export function scoreTone(score: number): Tone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'neutral';
}
