import { EmptyState } from '../../../components/ui/EmptyState';
import type { AdminTabProps } from './ZonesTab';

// Placeholder — the real Vehicles tab (table + CRUD modals) lands with the
// Zones tab in the next task of this slice.
export function VehiclesTab(props: AdminTabProps) {
  void props; // props are wired by AdminPage; consumed by the real tab
  return (
    <EmptyState
      icon="truck"
      title="Vehicles"
      body="Vehicle management coming up."
    />
  );
}
