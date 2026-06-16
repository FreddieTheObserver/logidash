import { useState } from 'react';
import {
  useRecommendationsGetForDelivery,
  type DeliveryDtoStatus,
  type RecommendationCandidateDto,
} from '@logidash/api-client';
import { useAuth } from '../../../app/auth/auth-context';
import { useZoneMap } from '../../../hooks/useZoneMap';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ICONS } from '../../../components/ui/icons';
import { WeightsLegend } from './WeightsLegend';
import { CandidateCard } from './CandidateCard';
import { IneligibleList } from './IneligibleList';

type ApiError = { response?: { status?: number } };

function RecommendationSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <Skeleton w={26} h={26} />
          <Skeleton w={36} h={36} style={{ borderRadius: 9999 }} />
          <div className="flex-1">
            <Skeleton w="40%" h={13} />
            <Skeleton w="60%" h={11} className="mt-2" />
          </div>
          <Skeleton w={46} h={24} />
          <Skeleton w={64} h={32} />
        </div>
      ))}
    </div>
  );
}

export function RecommendationPanel({
  deliveryId,
  deliveryStatus,
  assignedDriverId,
  onAssign,
}: {
  deliveryId: string;
  deliveryStatus: DeliveryDtoStatus;
  assignedDriverId: string | null;
  onAssign: (candidate: RecommendationCandidateDto) => void;
}) {
  const { user } = useAuth();
  const { zoneCode } = useZoneMap();
  const canCompute = user?.role === 'admin' || user?.role === 'dispatcher';
  const [refresh, setRefresh] = useState(false);

  // Only force a fresh engine run while the delivery is still `ready` (the only
  // state the server will recompute for). Once it leaves `ready` (e.g. after an
  // assign), drop back to the canonical key so an invalidated refetch reads the
  // existing run instead of pinning every refetch to ?refresh=true.
  const wantRefresh = refresh && deliveryStatus === 'ready';

  const q = useRecommendationsGetForDelivery(
    deliveryId,
    wantRefresh ? { refresh: true } : undefined,
    { query: { retry: false } },
  );

  const Sparkles = ICONS.sparkles;

  function runRecommendations() {
    setRefresh(true);
    void q.refetch();
  }

  const is404 = (q.error as ApiError | null)?.response?.status === 404;

  return (
    <div
      className="overflow-hidden rounded-lg border bg-surface"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        className="flex h-12 items-center justify-between border-b px-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: 'var(--color-primary)' }} />
          <h2
            className="text-[14px] font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Driver recommendations
          </h2>
          {q.data && (
            <Chip tone="neutral" size="sm">
              {q.data.candidates.filter((c) => c.eligible).length} eligible
              &middot; {q.data.candidates.filter((c) => !c.eligible).length} not
            </Chip>
          )}
        </div>
        {q.data && canCompute && (
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onClick={runRecommendations}
          >
            Re-run
          </Button>
        )}
      </div>

      {q.isPending ? (
        <RecommendationSkeleton />
      ) : is404 ? (
        <EmptyState
          icon="sparkles"
          title="No recommendation run yet"
          body={
            deliveryStatus === 'ready'
              ? 'Run the engine to rank eligible drivers 0–100 with a per-factor explanation.'
              : 'Recommendations are available once a delivery is in the ready state.'
          }
          action={
            canCompute && deliveryStatus === 'ready' ? (
              <Button
                variant="primary"
                icon="sparkles"
                onClick={runRecommendations}
              >
                Run recommendations
              </Button>
            ) : null
          }
        />
      ) : q.isError ? (
        <div className="p-4">
          <ErrorState
            body="Couldn't load recommendations."
            onRetry={() => void q.refetch()}
          />
        </div>
      ) : q.data ? (
        <>
          <WeightsLegend weights={q.data.weights} />
          <div className="space-y-2.5 p-4">
            {q.data.candidates
              .filter((c) => c.eligible)
              .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
              .map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  zoneCode={zoneCode}
                  isTopPick={c.rank === 1}
                  isAssigned={c.driverId === assignedDriverId}
                  canAssign={deliveryStatus === 'ready' && canCompute}
                  onAssign={onAssign}
                />
              ))}
          </div>
          <IneligibleList
            candidates={q.data.candidates.filter((c) => !c.eligible)}
            zoneCode={zoneCode}
          />
        </>
      ) : null}
    </div>
  );
}
