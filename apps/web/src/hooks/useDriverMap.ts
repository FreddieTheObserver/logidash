import { useMemo } from 'react';
import { useDriversList, type DriverDto } from '@logidash/api-client';

export function useDriverMap() {
  const query = useDriversList({ limit: 100 });
  const driverMap = useMemo(() => {
    const m = new Map<string, DriverDto>();
    for (const d of query.data?.data ?? []) {
      m.set(d.id, d);
    }
    return m;
  }, [query.data]);

  const driverName = (id: string | null | undefined): string =>
    id ? (driverMap.get(id)?.name ?? '—') : '—';

  return { driverMap, driverName, isLoading: query.isPending };
}
