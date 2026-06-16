import {
  DeliveryDtoStatus,
  DeliveryDtoPriority,
  type ZoneDto,
} from '@logidash/api-client';
import type { DeadlineState } from '../../../lib/format';
import { DELIVERY_LABEL, SLA_LABEL } from '../../../lib/tone';
import { Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';

export interface DeliveryFilters {
  search: string;
  status: DeliveryDtoStatus | 'all';
  priority: DeliveryDtoPriority | 'all';
  zoneId: string | 'all';
  sla: 'all' | DeadlineState;
  assignment: 'all' | 'assigned' | 'unassigned';
}

const STATUS_OPTIONS = Object.values(DeliveryDtoStatus);
const PRIORITY_OPTIONS = Object.values(DeliveryDtoPriority);
const SLA_OPTIONS: DeadlineState[] = ['on-track', 'at-risk', 'breached'];

function activeStyle(active: boolean) {
  return active
    ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
    : undefined;
}

export function DeliveryToolbar({
  filters,
  onChange,
  onClear,
  onNew,
  canCreate,
  zones,
}: {
  filters: DeliveryFilters;
  onChange: (filters: DeliveryFilters) => void;
  onClear: () => void;
  onNew: () => void;
  canCreate: boolean;
  zones: ZoneDto[];
}) {
  const Search = ICONS.search;
  const activeCount = [
    filters.status,
    filters.priority,
    filters.zoneId,
    filters.sla,
    filters.assignment,
  ].filter((v) => v !== 'all').length;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1">
        <Search
          size={15}
          className="absolute top-1/2 left-3 -translate-y-1/2"
          style={{ color: 'var(--color-text-muted)' }}
        />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search reference, address, package…"
          className="pl-9"
        />
      </div>

      <Select
        value={filters.status}
        onChange={(e) =>
          onChange({
            ...filters,
            status: e.target.value as DeliveryFilters['status'],
          })
        }
        style={activeStyle(filters.status !== 'all')}
      >
        <option value="all">Status: All</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            Status: {DELIVERY_LABEL[s]}
          </option>
        ))}
      </Select>

      <Select
        value={filters.priority}
        onChange={(e) =>
          onChange({
            ...filters,
            priority: e.target.value as DeliveryFilters['priority'],
          })
        }
        style={activeStyle(filters.priority !== 'all')}
      >
        <option value="all">Priority: All</option>
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p}>
            Priority: {p.charAt(0).toUpperCase() + p.slice(1)}
          </option>
        ))}
      </Select>

      <Select
        value={filters.zoneId}
        onChange={(e) => onChange({ ...filters, zoneId: e.target.value })}
        style={activeStyle(filters.zoneId !== 'all')}
      >
        <option value="all">Zone: All</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            Zone: {z.code}
          </option>
        ))}
      </Select>

      <Select
        value={filters.sla}
        onChange={(e) =>
          onChange({
            ...filters,
            sla: e.target.value as DeliveryFilters['sla'],
          })
        }
        style={activeStyle(filters.sla !== 'all')}
      >
        <option value="all">SLA: All</option>
        {SLA_OPTIONS.map((s) => (
          <option key={s} value={s}>
            SLA: {SLA_LABEL[s]}
          </option>
        ))}
      </Select>

      <Select
        value={filters.assignment}
        onChange={(e) =>
          onChange({
            ...filters,
            assignment: e.target.value as DeliveryFilters['assignment'],
          })
        }
        style={activeStyle(filters.assignment !== 'all')}
      >
        <option value="all">Assignment: All</option>
        <option value="assigned">Assignment: Assigned</option>
        <option value="unassigned">Assignment: Unassigned</option>
      </Select>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" icon="x" onClick={onClear}>
          Clear ({activeCount})
        </Button>
      )}

      <div className="flex-1" />

      {canCreate && (
        <Button variant="primary" size="md" icon="plus" onClick={onNew}>
          New delivery
        </Button>
      )}
    </div>
  );
}
