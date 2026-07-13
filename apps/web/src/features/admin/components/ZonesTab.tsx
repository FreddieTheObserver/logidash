import { EmptyState } from '../../../components/ui/EmptyState';

export interface AdminTabProps {
  adding: boolean;
  onCloseAdd: () => void;
  onSaved: (msg: string) => void;
}

// Placeholder — the real Zones tab (table + CRUD modals) lands with the
// Vehicles tab in the next task of this slice.
export function ZonesTab(props: AdminTabProps) {
  void props; // props are wired by AdminPage; consumed by the real tab
  return (
    <EmptyState icon="map" title="Zones" body="Zone management coming up." />
  );
}
