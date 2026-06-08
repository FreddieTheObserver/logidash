import { AuditService } from './audit.service';

function makePrismaMock() {
  return { auditLog: { create: jest.fn() } };
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
});
