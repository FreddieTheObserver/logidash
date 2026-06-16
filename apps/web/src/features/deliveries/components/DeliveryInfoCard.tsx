import type { ReactNode } from 'react';
import type { DeliveryDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { fromNow } from '../../../lib/format';
import { RouteEstimateStrip } from './RouteEstimateStrip';

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  const Icon = ICONS[icon];
  return (
    <div
      className="flex items-start gap-3 py-2.5"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <Icon
        size={15}
        style={{ color: 'var(--color-text-muted)', marginTop: 2 }}
      />
      <span
        className="w-28 shrink-0 text-[12.5px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <span
        className="flex-1 text-[13px]"
        style={{ color: 'var(--color-text)' }}
      >
        {children}
      </span>
    </div>
  );
}

export function DeliveryInfoCard({
  delivery,
  zoneCode,
}: {
  delivery: DeliveryDto;
  zoneCode: (id: string) => string;
}) {
  return (
    <Card>
      <div
        className="flex h-11 items-center border-b px-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h2
          className="text-[13.5px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Delivery details
        </h2>
      </div>
      <div className="grid gap-x-8 px-4 py-1 md:grid-cols-2">
        <div>
          <InfoRow icon="mapPin" label="Pickup">
            {delivery.pickupAddress}
          </InfoRow>
          <InfoRow icon="flag" label="Dropoff">
            {delivery.dropoffAddress}
          </InfoRow>
          <InfoRow icon="map" label="Zone">
            <span className="tnum">{zoneCode(delivery.zoneId)}</span>
          </InfoRow>
        </div>
        <div>
          <InfoRow icon="package" label="Package">
            <span className="capitalize">
              {delivery.packageSize} · {delivery.packageType}
            </span>{' '}
            · <span className="tnum">{delivery.packageWeight} kg</span>
          </InfoRow>
          <InfoRow icon="flag" label="Priority">
            <span className="capitalize">{delivery.priority}</span>
          </InfoRow>
          <InfoRow icon="clock" label="Deadline">
            <span className="tnum">{fromNow(delivery.deadlineAt)}</span>
          </InfoRow>
        </div>
      </div>
      <RouteEstimateStrip deliveryId={delivery.id} />
    </Card>
  );
}
