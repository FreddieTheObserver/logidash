import { Prisma } from '../../../generated/prisma/client';
import { AssignmentStatus } from '../../../generated/prisma/enums';

/**
 * Σ packageWeight (kg) of each driver's active assignments — the "current
 * load" input to the capacity rules. Accepts a transaction client or the
 * PrismaService (same pattern as AuditService.record).
 */
export async function activeLoadsByDriver(
  client: Prisma.TransactionClient,
  driverIds: string[],
): Promise<Map<string, number>> {
  if (driverIds.length === 0) {
    return new Map();
  }
  const rows = await client.assignment.findMany({
    where: { driverId: { in: driverIds }, status: AssignmentStatus.active },
    select: {
      driverId: true,
      delivery: { select: { packageWeight: true } },
    },
  });
  const loads = new Map<string, number>();
  for (const row of rows) {
    loads.set(
      row.driverId,
      (loads.get(row.driverId) ?? 0) + Number(row.delivery.packageWeight),
    );
  }
  return loads;
}
