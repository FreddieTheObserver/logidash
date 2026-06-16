import type { DeliveryDtoStatus } from '@logidash/api-client';
import { deadlineState, type DeadlineState } from './format';

export const TERMINAL: ReadonlySet<DeliveryDtoStatus> = new Set([
  'delivered',
  'failed',
  'cancelled',
]);

export function deriveSla(
  status: DeliveryDtoStatus,
  deadlineAt: string,
  now: number = Date.now(),
): DeadlineState | null {
  if (TERMINAL.has(status)) return null;
  return deadlineState(deadlineAt, now);
}
