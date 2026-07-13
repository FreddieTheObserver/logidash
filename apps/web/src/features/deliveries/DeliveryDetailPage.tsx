import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDeliveriesGetById,
  useDeliveriesChangeStatus,
  getDeliveriesGetByIdQueryKey,
  getDeliveriesListQueryKey,
  getDeliveriesGetAuditQueryKey,
  getRecommendationsGetForDeliveryQueryKey,
  getAssignmentsListByDeliveryQueryKey,
  getDashboardGetStatsQueryKey,
  getAuditListQueryKey,
} from '@logidash/api-client';
import type {
  DeliveryDtoStatus,
  RecommendationCandidateDto,
} from '@logidash/api-client';
import { useZoneMap } from '../../hooks/useZoneMap';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { Toast, type ToastData } from '../../components/ui/Toast';
import { ICONS } from '../../components/ui/icons';
import { DeliveryInfoCard } from './components/DeliveryInfoCard';
import { StatusTransitionBar } from './components/StatusTransitionBar';
import { RecommendationPanel } from './components/RecommendationPanel';
import { AssignModal } from './components/AssignModal';
import { AuditTimeline } from './components/AuditTimeline';

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
  const qc = useQueryClient();
  const delivery = useDeliveriesGetById(id);
  const changeStatus = useDeliveriesChangeStatus();
  const [assignCandidate, setAssignCandidate] =
    useState<RecommendationCandidateDto | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending toast timer on unmount so it can't setState on a dead component.
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const ChevronRight = ICONS.chevronRight;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: getDeliveriesGetByIdQueryKey(id) });
    void qc.invalidateQueries({
      queryKey: getRecommendationsGetForDeliveryQueryKey(id),
    });
    void qc.invalidateQueries({ queryKey: getDeliveriesGetAuditQueryKey(id) });
    void qc.invalidateQueries({
      queryKey: getAssignmentsListByDeliveryQueryKey(id),
    });
    void qc.invalidateQueries({ queryKey: getDeliveriesListQueryKey() });
    // Dashboard surfaces: badges/metrics (stats) + the recent-activity feed.
    void qc.invalidateQueries({ queryKey: getDashboardGetStatsQueryKey() });
    void qc.invalidateQueries({ queryKey: getAuditListQueryKey() });
  }

  function showToast(data: ToastData) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(data);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function handleChangeStatus(to: DeliveryDtoStatus, reason?: string) {
    setStatusError(null);
    try {
      await changeStatus.mutateAsync({ id, data: { status: to, reason } });
      invalidate();
      showToast({ message: `Status updated to ${to}.` });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setStatusError(e.response?.data?.message ?? 'Could not change status.');
    }
  }

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

  /*
   * isOwnActiveAssignment: AssignmentDto only exposes driverId (the driver
   * profile id), and AuthUserDto carries no driver-profile id to compare
   * against — there is no client-side linkage between the logged-in user
   * and a driver row. Defaulting to false; the server is authoritative for
   * driver-path transitions, so this only affects which buttons a driver
   * sees here.
   */
  const isOwnActiveAssignment = false;

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
        onChangeStatus={(to, reason) => {
          void handleChangeStatus(to, reason);
        }}
        pending={changeStatus.isPending}
        error={statusError}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <DeliveryInfoCard delivery={delivery.data} zoneCode={zoneCode} />
          <RecommendationPanel
            deliveryId={id}
            deliveryStatus={delivery.data.status}
            assignedDriverId={delivery.data.assignedDriver?.id ?? null}
            onAssign={(c) => setAssignCandidate(c)}
          />
        </div>
        <div className="xl:sticky xl:top-6">
          <AuditTimeline deliveryId={id} />
        </div>
      </div>

      {assignCandidate && (
        <AssignModal
          open
          deliveryId={id}
          reference={delivery.data.reference}
          candidate={assignCandidate}
          onClose={() => setAssignCandidate(null)}
          onAssigned={() => {
            invalidate();
            showToast({ message: 'Driver assigned.' });
          }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
