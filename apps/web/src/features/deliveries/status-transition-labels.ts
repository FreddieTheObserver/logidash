import type { DeliveryDtoStatus } from '@logidash/api-client';

export const TRANSITION_LABEL: Record<DeliveryDtoStatus, string> = {
  draft: 'Mark Draft',
  ready: 'Mark Ready',
  assigned: 'Mark Assigned',
  picked_up: 'Mark Picked up',
  in_transit: 'Mark In transit',
  delivered: 'Mark Delivered',
  failed: 'Mark Failed',
  cancelled: 'Cancel',
};
