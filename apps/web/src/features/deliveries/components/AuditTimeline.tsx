import {
  useDeliveriesGetAudit,
  type AuditEntryDto,
} from '@logidash/api-client';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { fromNow } from '../../../lib/format';

const ACTION_ICON: Record<string, IconName> = {
  'delivery.created': 'package',
  'delivery.status_changed': 'arrowRight',
  'recommendation.run_created': 'sparkles',
  'assignment.created': 'user',
};

const ACTION_LABEL: Record<string, string> = {
  'delivery.created': 'Delivery created',
  'delivery.status_changed': 'Status changed',
  'recommendation.run_created': 'Recommendations run',
  'assignment.created': 'Driver assigned',
};

function humanizeAction(action: string): string {
  const tail = action.split('.').pop() ?? action;
  return tail
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function entryLabel(entry: AuditEntryDto): string {
  const base = ACTION_LABEL[entry.action] ?? humanizeAction(entry.action);
  if (entry.action === 'delivery.status_changed') {
    const before = (entry.before as { status?: string } | undefined)?.status;
    const after = (entry.after as { status?: string } | undefined)?.status;
    if (before && after) return `${base}: ${before} → ${after}`;
  }
  return base;
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton w={23} h={23} style={{ borderRadius: 9999 }} />
          <div className="flex-1">
            <Skeleton w="50%" h={12} />
            <Skeleton w="70%" h={11} className="mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuditTimeline({ deliveryId }: { deliveryId: string }) {
  const q = useDeliveriesGetAudit(deliveryId);
  const entries = q.data?.data ?? [];
  const Activity = ICONS.activity;

  return (
    <div
      className="overflow-hidden rounded-lg border bg-surface"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        className="flex h-12 items-center gap-2 border-b px-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Activity size={15} style={{ color: 'var(--color-text-muted)' }} />
        <h2
          className="text-[14px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Activity
        </h2>
      </div>

      {q.isPending ? (
        <TimelineSkeleton />
      ) : q.isError ? (
        <div className="p-4">
          <ErrorState
            body="Couldn't load the activity log."
            onRetry={() => void q.refetch()}
          />
        </div>
      ) : (
        <ol className="p-4">
          {entries.map((entry, i) => {
            const Icon = ICONS[ACTION_ICON[entry.action] ?? 'activity'];
            return (
              <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < entries.length - 1 && (
                  <span
                    className="absolute top-6 bottom-0 left-[11px]"
                    style={{ width: 1, background: 'var(--color-border)' }}
                  />
                )}
                <span
                  className="z-10 flex shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: 23,
                    height: 23,
                    background: 'var(--tint-primary)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Icon size={12} />
                </span>
                <div className="-mt-0.5 min-w-0">
                  <div
                    className="text-[12.5px] font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {entryLabel(entry)}
                  </div>
                  {entry.reason && (
                    <div
                      className="mt-0.5 text-[12px] leading-snug"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {entry.reason}
                    </div>
                  )}
                  <div
                    className="mt-1 flex items-center gap-1.5 text-[11.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <span className="font-medium">{entry.actorName}</span>
                    <span style={{ opacity: 0.5 }}>&middot;</span>
                    <span>{entry.actorRole}</span>
                    <span style={{ opacity: 0.5 }}>&middot;</span>
                    <span className="tnum">{fromNow(entry.createdAt)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
