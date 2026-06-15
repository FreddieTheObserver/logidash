import { AuditService } from './audit.service';

function makePrismaMock() {
  return {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    assignment: { findMany: jest.fn() },
    $transaction: jest
      .fn()
      .mockImplementation((arg: unknown) =>
        Array.isArray(arg)
          ? Promise.all(arg as Promise<unknown>[])
          : (arg as (c: unknown) => unknown)({}),
      ),
  };
}

describe('AuditService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuditService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuditService(prisma as never);
  });

  it('writes an audit row with the given fields', async () => {
    await service.record({
      actorUserId: 'u1',
      action: 'delivery.status_changed',
      entityType: 'Delivery',
      entityId: 'd1',
      before: { status: 'draft' },
      after: { status: 'ready' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'u1',
        action: 'delivery.status_changed',
        entityType: 'Delivery',
        entityId: 'd1',
        before: { status: 'draft' },
        after: { status: 'ready' },
        reason: undefined,
      },
    });
  });

  it('uses a passed transaction client instead of the default', async () => {
    const tx = { auditLog: { create: jest.fn() } };
    await service.record(
      {
        actorUserId: 'u1',
        action: 'x',
        entityType: 'Delivery',
        entityId: 'd1',
      },
      tx as never,
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('lists delivery + assignment audit rows newest-first with actor', async () => {
    prisma.assignment.findMany.mockResolvedValue([{ id: 'a1' }]);
    // Let the default $transaction array-impl run so the real findMany/count
    // queries are exercised (and their args asserted), not stubbed away.
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        action: 'delivery.status_changed',
        entityType: 'Delivery',
        actorUserId: 'u1',
        entityId: 'd1',
        reason: null,
        before: { status: 'ready' },
        after: { status: 'assigned' },
        createdAt: new Date(),
        actor: { name: 'Dee', role: 'dispatcher' },
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);
    const res = await service.listForDelivery('d1', { page: 1, limit: 20 });
    expect(prisma.assignment.findMany).toHaveBeenCalledWith({
      where: { deliveryId: 'd1' },
      select: { id: true },
    });
    // Query is keyed to the delivery + its assignment ids, newest-first, paginated.
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { entityType: 'Delivery', entityId: 'd1' },
            { entityType: 'Assignment', entityId: { in: ['a1'] } },
          ],
        },
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(res.data[0]).toMatchObject({
      actorName: 'Dee',
      actorRole: 'dispatcher',
      after: { status: 'assigned' },
    });
  });
});
