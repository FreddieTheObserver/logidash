import { DeliveryStatus } from '../../generated/prisma/enums';

/** Spec §8 allowed transitions (anything else → 409). */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.draft]: [DeliveryStatus.ready, DeliveryStatus.cancelled],
  [DeliveryStatus.ready]: [DeliveryStatus.assigned, DeliveryStatus.cancelled],
  [DeliveryStatus.assigned]: [
    DeliveryStatus.picked_up,
    DeliveryStatus.ready, // unassign
    DeliveryStatus.cancelled,
  ],
  [DeliveryStatus.picked_up]: [
    DeliveryStatus.in_transit,
    DeliveryStatus.failed,
    DeliveryStatus.cancelled,
  ],
  [DeliveryStatus.in_transit]: [
    DeliveryStatus.delivered,
    DeliveryStatus.failed,
  ],
  [DeliveryStatus.delivered]: [],
  [DeliveryStatus.failed]: [],
  [DeliveryStatus.cancelled]: [],
};

export function canTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return DELIVERY_TRANSITIONS[from].includes(to);
}

/** Operational path a driver may drive on their own active assignment. */
const DRIVER_PATH: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  [DeliveryStatus.assigned]: [DeliveryStatus.picked_up],
  [DeliveryStatus.picked_up]: [DeliveryStatus.in_transit],
  [DeliveryStatus.in_transit]: [
    DeliveryStatus.delivered,
    DeliveryStatus.failed,
  ],
};

export function isDriverTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return (DRIVER_PATH[from] ?? []).includes(to);
}

/** Statuses that mean a delivery no longer has an active assignment. */
export const ASSIGNMENT_CLOSING: DeliveryStatus[] = [
  DeliveryStatus.delivered,
  DeliveryStatus.failed,
  DeliveryStatus.cancelled,
  DeliveryStatus.ready, // unassign
];
