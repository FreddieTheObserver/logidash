import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
}
