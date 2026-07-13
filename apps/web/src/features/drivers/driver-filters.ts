import type { DriverDto, DriverDtoAvailability } from '@logidash/api-client';
import type { Tone } from '../../lib/tone';

export interface DriverFilters {
  search: string;
  availability: DriverDtoAvailability | 'all';
}

export const DEFAULT_DRIVER_FILTERS: DriverFilters = {
  search: '',
  availability: 'all',
};

/** Client-side, page-scoped filtering (no server params — Slice 2 precedent). */
export function matchesDriverFilters(d: DriverDto, f: DriverFilters): boolean {
  if (f.availability !== 'all' && d.availability !== f.availability)
    return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return d.name.toLowerCase().includes(q);
}

/** danger at max, warning above 60% utilisation, else success. */
export function workloadTone(active: number, max: number): Tone {
  if (max > 0 && active >= max) return 'danger';
  if (max > 0 && active / max > 0.6) return 'warning';
  return 'success';
}
