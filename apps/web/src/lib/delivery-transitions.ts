import type { DeliveryDtoStatus, Role } from '@logidash/api-client';

// Mirrors the handoff lifecycle graph (README "Delivery Lifecycle").
export const DELIVERY_TRANSITIONS: Record<
  DeliveryDtoStatus,
  DeliveryDtoStatus[]
> = {
  draft: ['ready', 'cancelled'],
  ready: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'ready', 'cancelled'],
  picked_up: ['in_transit', 'failed', 'cancelled'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: [],
  cancelled: [],
};

// The driver operational path (own active assignment only).
const DRIVER_PATH: Partial<Record<DeliveryDtoStatus, DeliveryDtoStatus[]>> = {
  assigned: ['picked_up'],
  picked_up: ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
};

export function allowedTransitions(
  status: DeliveryDtoStatus,
  role: Role,
  isOwnActiveAssignment: boolean,
): DeliveryDtoStatus[] {
  if (role === 'viewer') return [];
  if (role === 'driver') {
    return isOwnActiveAssignment ? (DRIVER_PATH[status] ?? []) : [];
  }
  // admin / dispatcher: all allowed edges except ->assigned (assign flow owns it)
  return DELIVERY_TRANSITIONS[status].filter((s) => s !== 'assigned');
}
