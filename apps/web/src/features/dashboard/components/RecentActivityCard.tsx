import { Link } from 'react-router-dom';
import { useAuditList } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { fromNow } from '../../../lib/format';
import { TONE, type Tone } from '../../../lib/tone';

function actionMeta(action: string): { icon: IconName; tone: Tone } {
  if (action.startsWith('assignment'))
    return { icon: 'route', tone: 'primary' };
  if (action.includes('status')) return { icon: 'activity', tone: 'info' };
  if (action.startsWith('recommendation'))
    return { icon: 'sparkles', tone: 'primary' };
  return { icon: 'plus', tone: 'neutral' }; // *.created and everything else
}

function humanize(action: string): string {
  const s = action.replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RecentActivityCard() {
  const q = useAuditList({ page: 1, limit: 8 });
  const entries = q.data?.data ?? [];

  return (
    <Card className="p-4">
      <h2
        className="text-[13.5px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Recent activity
      </h2>
      <div className="mt-3 space-y-1.5">
        {q.isError ? (
          <ErrorState
            body="Recent activity could not be loaded."
            onRetry={() => void q.refetch()}
          />
        ) : q.isPending ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={24} />)
        ) : entries.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No activity yet"
            body="Actions across the system show up here."
          />
        ) : (
          entries.map((e) => {
            const meta = actionMeta(e.action);
            const Icon = ICONS[meta.icon];
            const body = (
              <>
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: TONE[meta.tone].bg,
                    color: TONE[meta.tone].fg,
                  }}
                >
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[12.5px]"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {humanize(e.action)}
                    {e.reason ? ` — ${e.reason}` : ''}
                  </span>
                  <span
                    className="block text-[11.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {e.actorName} · {e.actorRole} · {fromNow(e.createdAt)}
                  </span>
                </span>
              </>
            );
            // Audit rows use capitalized entity types ('Delivery', 'Assignment').
            return e.entityType === 'Delivery' ? (
              <Link
                key={e.id}
                to={`/deliveries/${e.entityId}`}
                className="hover:bg-surface-alt ring-focus -mx-2 flex items-start gap-2.5 rounded-md px-2 py-1"
              >
                {body}
              </Link>
            ) : (
              <div key={e.id} className="flex items-start gap-2.5 py-1">
                {body}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
