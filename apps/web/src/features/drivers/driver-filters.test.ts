import { describe, it, expect } from 'vitest';
import type { DriverDto } from '@logidash/api-client';
import {
  DEFAULT_DRIVER_FILTERS,
  matchesDriverFilters,
  workloadTone,
} from './driver-filters';

const driver = (over: Partial<DriverDto> = {}): DriverDto =>
  ({
    id: 'd1',
    userId: 'u1',
    name: 'Priya Kumar',
    availability: 'available',
    baseZoneId: 'z1',
    activeJobCount: 1,
    maxConcurrentJobs: 3,
    vehicle: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as DriverDto;

describe('matchesDriverFilters', () => {
  it('matches on name search, case-insensitively', () => {
    expect(
      matchesDriverFilters(driver(), {
        ...DEFAULT_DRIVER_FILTERS,
        search: 'priya',
      }),
    ).toBe(true);
    expect(
      matchesDriverFilters(driver(), {
        ...DEFAULT_DRIVER_FILTERS,
        search: 'zed',
      }),
    ).toBe(false);
  });

  it('filters by availability', () => {
    expect(
      matchesDriverFilters(driver({ availability: 'busy' }), {
        ...DEFAULT_DRIVER_FILTERS,
        availability: 'available',
      }),
    ).toBe(false);
    expect(
      matchesDriverFilters(driver({ availability: 'busy' }), {
        ...DEFAULT_DRIVER_FILTERS,
        availability: 'busy',
      }),
    ).toBe(true);
  });
});

describe('workloadTone', () => {
  it('tones the workload meter by utilisation', () => {
    expect(workloadTone(3, 3)).toBe('danger');
    expect(workloadTone(2, 3)).toBe('warning'); // 0.66 > 0.6
    expect(workloadTone(1, 3)).toBe('success');
    expect(workloadTone(0, 0)).toBe('success');
  });
});
