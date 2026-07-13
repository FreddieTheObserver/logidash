import { useDashboardGetStats } from '@logidash/api-client';
import { ErrorState } from '../../components/ui/ErrorState';
import { MetricCards } from './components/MetricCards';
import { DriverAvailabilityCard } from './components/DriverAvailabilityCard';

export function DashboardPage() {
  const statsQ = useDashboardGetStats({
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

  if (statsQ.isError) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <ErrorState
          body="The dashboard stats could not be loaded."
          onRetry={() => void statsQ.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6">
      <MetricCards stats={statsQ.data} isPending={statsQ.isPending} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div /> {/* NeedsAttentionCard lands in the next task */}
        <div className="space-y-4">
          <DriverAvailabilityCard
            stats={statsQ.data}
            isPending={statsQ.isPending}
          />
        </div>
      </div>
    </div>
  );
}
