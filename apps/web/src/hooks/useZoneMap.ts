import { useMemo } from 'react';
import { useZonesList, type ZoneDto } from '@logidash/api-client';

export function useZoneMap() {
  const query = useZonesList({ limit: 100 });
  const zoneMap = useMemo(() => {
    const m = new Map<string, ZoneDto>();
    for (const z of query.data?.data ?? []) {
      m.set(z.id, z);
    }
    return m;
  }, [query.data]);

  const zoneCode = (id: string): string => zoneMap.get(id)?.code ?? id;

  return { zoneMap, zoneCode, isLoading: query.isPending };
}
