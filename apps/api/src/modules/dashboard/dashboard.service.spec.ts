import { DashboardService } from './dashboard.service';

function makePrismaMock() {
  return {
    delivery: { groupBy: jest.fn(), count: jest.fn() },
    driverProfile: { groupBy: jest.fn() },
    $transaction: jest
      .fn()
      .mockImplementation((arg: unknown) =>
        Promise.all(arg as Promise<unknown>[]),
      ),
  };
}

describe('DashboardService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: DashboardService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new DashboardService(prisma as never);
  });

  it('maps status and availability buckets into the stats DTO', async () => {
    prisma.delivery.groupBy.mockResolvedValue([
      { status: 'draft', _count: 2 },
      { status: 'ready', _count: 3 },
      { status: 'assigned', _count: 1 },
      { status: 'in_transit', _count: 2 },
      { status: 'delivered', _count: 9 },
    ]);
    prisma.delivery.count
      .mockResolvedValueOnce(1) // breached
      .mockResolvedValueOnce(2); // atRisk
    prisma.driverProfile.groupBy.mockResolvedValue([
      { availability: 'available', _count: 2 },
      { availability: 'busy', _count: 1 },
    ]);

    const stats = await service.getStats(new Date('2026-07-13T10:00:00Z'));

    expect(stats.deliveries).toEqual({
      draft: 2,
      ready: 3,
      active: 3, // assigned 1 + picked_up 0 + in_transit 2
      atRisk: 2,
      breached: 1,
      open: 8, // draft 2 + ready 3 + active 3
    });
    expect(stats.drivers).toEqual({
      available: 2,
      busy: 1,
      offline: 0,
      total: 3,
    });
  });

  it('returns zeros on an empty database', async () => {
    prisma.delivery.groupBy.mockResolvedValue([]);
    prisma.delivery.count.mockResolvedValue(0);
    prisma.driverProfile.groupBy.mockResolvedValue([]);

    const stats = await service.getStats();

    expect(stats.deliveries.open).toBe(0);
    expect(stats.deliveries.atRisk).toBe(0);
    expect(stats.drivers.total).toBe(0);
  });

  it('queries breached and at-risk windows around the provided now', async () => {
    prisma.delivery.groupBy.mockResolvedValue([]);
    prisma.delivery.count.mockResolvedValue(0);
    prisma.driverProfile.groupBy.mockResolvedValue([]);
    const now = new Date('2026-07-13T10:00:00Z');

    await service.getStats(now);

    // First count = breached (deadline in the past), second = at-risk window.
    expect(prisma.delivery.count).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ deadlineAt: { lt: now } }) as object,
    });
    expect(prisma.delivery.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        deadlineAt: { gte: now, lt: new Date('2026-07-13T11:30:00Z') },
      }) as object,
    });
  });
});
