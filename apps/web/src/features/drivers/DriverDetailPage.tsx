import { useParams, Link } from 'react-router-dom';
import { useDriversGetById } from '@logidash/api-client';
import { useZoneMap } from '../../hooks/useZoneMap';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { DriverProfileCard } from './components/DriverProfileCard';
import { DriverWorkloadCard } from './components/DriverWorkloadCard';
import { AssignmentHistoryCard } from './components/AssignmentHistoryCard';

export function DriverDetailPage() {
  const { id = '' } = useParams();
  const { zoneCode } = useZoneMap();
  const q = useDriversGetById(id);

  if (q.isError) {
    return (
      <div className="mx-auto max-w-[1100px] p-6">
        <ErrorState
          body="This driver could not be loaded."
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-6">
      <Link
        to="/drivers"
        className="ring-focus inline-block text-[12px] hover:underline"
        style={{ color: 'var(--color-text-muted)' }}
      >
        ← Drivers
      </Link>
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Skeleton h={224} />
          <Skeleton h={224} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <DriverProfileCard driver={q.data} zoneCode={zoneCode} />
            <DriverWorkloadCard driver={q.data} />
          </div>
          <AssignmentHistoryCard driverId={q.data.id} />
        </>
      )}
    </div>
  );
}
