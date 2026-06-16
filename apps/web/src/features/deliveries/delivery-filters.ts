import type { DeliveryDto } from '@logidash/api-client';
import { deriveSla } from '../../lib/sla';
import type { DeliveryFilters } from './components/DeliveryToolbar';

export const DEFAULT_FILTERS: DeliveryFilters = {
  search: '',
  status: 'all',
  priority: 'all',
  zoneId: 'all',
  sla: 'all',
  assignment: 'all',
};

export function matchesClientFilters(
  d: DeliveryDto,
  filters: DeliveryFilters,
): boolean {
  if (filters.search) {
    const haystack =
      `${d.reference} ${d.pickupAddress} ${d.dropoffAddress} ${d.packageType}`.toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  if (
    filters.sla !== 'all' &&
    deriveSla(d.status, d.deadlineAt) !== filters.sla
  ) {
    return false;
  }
  if (filters.assignment === 'assigned' && !d.assignedDriver) return false;
  if (filters.assignment === 'unassigned' && d.assignedDriver) return false;
  return true;
}
