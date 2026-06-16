import { useDeliveriesGetRouteEstimate } from '@logidash/api-client';
import { Chip } from '../../../components/ui/Chip';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ICONS } from '../../../components/ui/icons';

export function RouteEstimateStrip({ deliveryId }: { deliveryId: string }) {
  const q = useDeliveriesGetRouteEstimate(deliveryId);
  const Route = ICONS.route;

  if (q.isPending) {
    return (
      <div
        className="m-4 mt-2 flex items-center gap-4 rounded-md border p-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Skeleton w={32} h={32} />
        <Skeleton w={120} h={15} />
        <Skeleton w={120} h={15} />
      </div>
    );
  }

  const data = q.data;
  const ok = !!data && data.available && !data.degraded;

  return (
    <div
      className="m-4 mt-2 flex items-center gap-4 rounded-md border p-3"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span
        className="flex items-center justify-center rounded-md"
        style={{
          width: 32,
          height: 32,
          background: 'var(--tint-info)',
          color: 'var(--color-info)',
        }}
      >
        <Route size={17} />
      </span>
      {ok ? (
        <>
          <div className="flex items-center gap-6">
            <div>
              <div
                className="text-[11px] uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Distance
              </div>
              <div
                className="tnum text-[15px] font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                {((data.distanceMeters ?? 0) / 1000).toFixed(1)} km
              </div>
            </div>
            <div>
              <div
                className="text-[11px] uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Est. duration
              </div>
              <div
                className="tnum text-[15px] font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                {Math.round((data.durationSeconds ?? 0) / 60)} min
              </div>
            </div>
          </div>
          <div className="flex-1" />
          <Chip tone="success" size="sm" dot>
            {data.provider}
            {data.cached ? ' · cached' : ''}
          </Chip>
        </>
      ) : (
        <>
          <div className="flex-1" />
          <Chip tone="warning" size="sm" dot>
            Estimate unavailable
          </Chip>
        </>
      )}
    </div>
  );
}
