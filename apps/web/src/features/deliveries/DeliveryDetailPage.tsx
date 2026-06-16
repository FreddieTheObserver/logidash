import { useParams, Link } from 'react-router-dom';
import {
  useDeliveriesGetById,
  useAssignmentsListByDelivery,
} from '@logidash/api-client';
import { useZoneMap } from '../../hooks/useZoneMap';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { ICONS } from '../../components/ui/icons';
import { DeliveryInfoCard } from './components/DeliveryInfoCard';
import { StatusTransitionBar } from './components/StatusTransitionBar';

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-6">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton w={38} h={38} />
          <div className="flex-1">
            <Skeleton w={180} h={18} />
            <Skeleton w={220} h={12} className="mt-2" />
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="p-4">
          <Skeleton w="100%" h={160} />
        </Card>
        <Card className="p-4">
          <Skeleton w="100%" h={220} />
        </Card>
      </div>
    </div>
  );
}

export function DeliveryDetailPage() {
  const { id = '' } = useParams();
  const { zoneCode } = useZoneMap();
  const delivery = useDeliveriesGetById(id);
  const assignments = useAssignmentsListByDelivery(id);

  const ChevronRight = ICONS.chevronRight;

  if (delivery.isPending) return <DetailSkeleton />;
  if (delivery.isError || !delivery.data) {
    return (
      <div className="mx-auto max-w-[1280px] p-6">
        <ErrorState
          body="The delivery could not be loaded."
          onRetry={() => delivery.refetch()}
        />
      </div>
    );
  }

  const activeAssignment = assignments.data?.data?.find(
    (a) => a.status === 'active',
  );

  /*
   * isOwnActiveAssignment: AssignmentDto only exposes driverId (the driver
   * profile id), and AuthUserDto carries no driver-profile id to compare
   * against — there is no client-side linkage between the logged-in user
   * and a driver row. Defaulting to false; the server is authoritative for
   * driver-path transitions, so this only affects which buttons a driver
   * sees here.
   */
  const isOwnActiveAssignment = false;
  // Task 12/13 will consume `activeAssignment` (Assigned marker + invalidation);
  // discarded for now to keep the query wired without an unused-var error.
  void activeAssignment;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-6">
      <div
        className="flex items-center gap-1.5 text-[12.5px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Link to="/deliveries" className="ring-focus hover:underline">
          Deliveries
        </Link>
        <ChevronRight size={13} />
        <span style={{ color: 'var(--color-text)' }}>
          {delivery.data.reference}
        </span>
      </div>

      <StatusTransitionBar
        delivery={delivery.data}
        zoneCode={zoneCode}
        isOwnActiveAssignment={isOwnActiveAssignment}
        // Task 13 wires useDeliveriesChangeStatus + cache invalidation here.
        onChangeStatus={() => {}}
        pending={false}
        error={null}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <DeliveryInfoCard delivery={delivery.data} zoneCode={zoneCode} />
          <Card className="p-4">
            <p
              className="text-[13px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Recommendations — coming in Task 12
            </p>
          </Card>
        </div>
        <div className="xl:sticky xl:top-6">
          <Card className="p-4">
            <p
              className="text-[13px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Activity — coming in Task 15
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
