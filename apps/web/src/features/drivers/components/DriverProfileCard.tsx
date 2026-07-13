import type { DriverDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { AvailabilityChip } from '../../../components/ui/Chip';
import { Avatar } from '../../../components/ui/Avatar';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { initials } from '../../../lib/format';

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  const Icon = ICONS[icon];
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={15} style={{ color: 'var(--color-text-muted)' }} />
      <span
        className="w-20 text-[12px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <span
        className="text-[12.5px] font-medium capitalize"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </span>
    </div>
  );
}

export function DriverProfileCard({
  driver,
  zoneCode,
}: {
  driver: DriverDto;
  zoneCode: (id: string) => string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar
          initials={initials(driver.name)}
          name={driver.name}
          id={driver.id}
          size={56}
        />
        <div>
          <div
            className="text-[16px] font-semibold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {driver.name}
          </div>
          <div className="mt-1">
            <AvailabilityChip value={driver.availability} size="sm" />
          </div>
        </div>
      </div>
      <div
        className="mt-4 space-y-2.5 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <InfoRow
          icon="mapPin"
          label="Base zone"
          value={zoneCode(driver.baseZoneId)}
        />
        <InfoRow
          icon="truck"
          label="Vehicle"
          value={
            driver.vehicle
              ? `${driver.vehicle.type} · ${driver.vehicle.status}`
              : 'No vehicle linked'
          }
        />
        <InfoRow
          icon="calendar"
          label="Joined"
          value={new Date(driver.createdAt).toLocaleDateString()}
        />
      </div>
    </Card>
  );
}
