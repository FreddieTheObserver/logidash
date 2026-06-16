import type { FactorContributionDtoFactor } from '@logidash/api-client';
import type { IconName } from '../../../components/ui/icons';

export const FACTOR_META: Record<
  FactorContributionDtoFactor,
  { label: string; icon: IconName }
> = {
  zoneFit: { label: 'Zone fit', icon: 'mapPin' },
  routeProximity: { label: 'Route proximity', icon: 'route' },
  remainingCapacity: { label: 'Remaining capacity', icon: 'scale' },
  workloadBalance: { label: 'Workload balance', icon: 'activity' },
  deadlineFit: { label: 'Deadline fit', icon: 'clock' },
  priorityFit: { label: 'Priority fit', icon: 'flag' },
};
