import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  DriverAvailability,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

/** Mirrors apps/web/src/lib/format.ts `deadlineState` (at-risk < 90 min). */
export const AT_RISK_WINDOW_MS = 90 * 60_000;

const OPEN_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.draft,
  DeliveryStatus.ready,
  DeliveryStatus.assigned,
  DeliveryStatus.picked_up,
  DeliveryStatus.in_transit,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(now: Date = new Date()): Promise<DashboardStatsDto> {
    const atRiskUntil = new Date(now.getTime() + AT_RISK_WINDOW_MS);
    const [byStatus, breached, atRisk, byAvailability] =
      await this.prisma.$transaction([
        this.prisma.delivery.groupBy({
          by: ['status'],
          orderBy: { status: 'asc' },
          _count: true,
        }),
        this.prisma.delivery.count({
          where: { status: { in: OPEN_STATUSES }, deadlineAt: { lt: now } },
        }),
        this.prisma.delivery.count({
          where: {
            status: { in: OPEN_STATUSES },
            deadlineAt: { gte: now, lt: atRiskUntil },
          },
        }),
        this.prisma.driverProfile.groupBy({
          by: ['availability'],
          orderBy: { availability: 'asc' },
          _count: true,
        }),
      ]);

    // In the $transaction array context Prisma widens `_count` away from
    // `number`; at runtime `_count: true` always yields a number — narrow it.
    const asCount = (c: unknown): number => (typeof c === 'number' ? c : 0);
    const statusCount = (s: DeliveryStatus): number =>
      asCount(byStatus.find((r) => r.status === s)?._count);
    const availCount = (a: DriverAvailability): number =>
      asCount(byAvailability.find((r) => r.availability === a)?._count);

    const draft = statusCount(DeliveryStatus.draft);
    const ready = statusCount(DeliveryStatus.ready);
    const active =
      statusCount(DeliveryStatus.assigned) +
      statusCount(DeliveryStatus.picked_up) +
      statusCount(DeliveryStatus.in_transit);
    const available = availCount(DriverAvailability.available);
    const busy = availCount(DriverAvailability.busy);
    const offline = availCount(DriverAvailability.offline);

    return {
      deliveries: {
        draft,
        ready,
        active,
        atRisk,
        breached,
        open: draft + ready + active,
      },
      drivers: { available, busy, offline, total: available + busy + offline },
    };
  }
}
