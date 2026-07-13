import { Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { DEFAULT_DRIVER_FILTERS, type DriverFilters } from '../driver-filters';

const AVAILABILITIES = ['available', 'busy', 'offline'] as const;

export function DriverToolbar({
  filters,
  onChange,
  onClear,
}: {
  filters: DriverFilters;
  onChange: (f: DriverFilters) => void;
  onClear: () => void;
}) {
  const active =
    filters.search !== '' ||
    filters.availability !== DEFAULT_DRIVER_FILTERS.availability;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-64">
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search driver name…"
          aria-label="Search drivers"
        />
      </div>
      <div className="w-44">
        <Select
          value={filters.availability}
          onChange={(e) =>
            onChange({
              ...filters,
              availability: e.target.value as DriverFilters['availability'],
            })
          }
          aria-label="Availability filter"
        >
          <option value="all">All availability</option>
          {AVAILABILITIES.map((a) => (
            <option key={a} value={a}>
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </option>
          ))}
        </Select>
      </div>
      {active && (
        <Button variant="secondary" size="sm" icon="x" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}
