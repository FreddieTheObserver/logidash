import { DeliveryStatus } from '../../generated/prisma/enums';
import { canTransition, isDriverTransition } from './delivery-status';

describe('delivery-status', () => {
  it('allows the spec §8 transitions', () => {
    expect(canTransition(DeliveryStatus.draft, DeliveryStatus.ready)).toBe(
      true,
    );
    expect(canTransition(DeliveryStatus.ready, DeliveryStatus.assigned)).toBe(
      true,
    );
    expect(canTransition(DeliveryStatus.assigned, DeliveryStatus.ready)).toBe(
      true,
    );
    expect(
      canTransition(DeliveryStatus.in_transit, DeliveryStatus.delivered),
    ).toBe(true);
  });

  it('rejects illegal transitions and moves out of terminal states', () => {
    expect(canTransition(DeliveryStatus.draft, DeliveryStatus.delivered)).toBe(
      false,
    );
    expect(canTransition(DeliveryStatus.delivered, DeliveryStatus.ready)).toBe(
      false,
    );
    expect(canTransition(DeliveryStatus.cancelled, DeliveryStatus.ready)).toBe(
      false,
    );
  });

  it('recognises the driver operational path only', () => {
    expect(
      isDriverTransition(DeliveryStatus.assigned, DeliveryStatus.picked_up),
    ).toBe(true);
    expect(
      isDriverTransition(DeliveryStatus.in_transit, DeliveryStatus.failed),
    ).toBe(true);
    // drivers may not cancel or unassign
    expect(
      isDriverTransition(DeliveryStatus.assigned, DeliveryStatus.cancelled),
    ).toBe(false);
    expect(
      isDriverTransition(DeliveryStatus.assigned, DeliveryStatus.ready),
    ).toBe(false);
    expect(isDriverTransition(DeliveryStatus.draft, DeliveryStatus.ready)).toBe(
      false,
    );
  });
});
