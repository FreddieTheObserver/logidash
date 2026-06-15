import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  paginate,
  type Paginated,
  toSkipTake,
} from '../../common/pagination/paginate';
import { AuditEntryDto } from './dto/audit-entry.dto';

type AuditRowWithActor = Prisma.AuditLogGetPayload<{
  include: { actor: true };
}>;

function toAuditEntryDto(row: AuditRowWithActor): AuditEntryDto {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    actorUserId: row.actorUserId,
    actorName: row.actor.name,
    actorRole: row.actor.role,
    before: (row.before as Record<string, unknown> | null) ?? undefined,
    after: (row.after as Record<string, unknown> | null) ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: row.createdAt,
  };
}

export interface AuditEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an audit row. Pass a transaction client (`tx`) to commit the audit
   * atomically with a surrounding mutation; omit it to write standalone.
   */
  async record(
    entry: AuditEntry,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
      },
    });
  }

  async listForDelivery(
    deliveryId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<AuditEntryDto>> {
    const assignments = await this.prisma.assignment.findMany({
      where: { deliveryId },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { entityType: 'Delivery', entityId: deliveryId },
        ...(assignmentIds.length
          ? [{ entityType: 'Assignment', entityId: { in: assignmentIds } }]
          : []),
      ],
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(rows.map(toAuditEntryDto), total, query.page, query.limit);
  }
}
