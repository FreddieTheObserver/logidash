import { useRef, useState, useEffect } from 'react';
import {
  useUsersList,
  useZonesList,
  useVehiclesList,
} from '@logidash/api-client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Toast, type ToastData } from '../../components/ui/Toast';
import { UsersTab } from './components/UsersTab';
import { ZonesTab } from './components/ZonesTab';
import { VehiclesTab } from './components/VehiclesTab';

type TabKey = 'users' | 'zones' | 'vehicles';

const TAB_META: Record<
  TabKey,
  { label: string; description: string; addLabel: string }
> = {
  users: {
    label: 'Users & roles',
    description: 'Accounts, roles, and access status across the team.',
    addLabel: 'Add user',
  },
  zones: {
    label: 'Zones',
    description: 'Operational areas used for dispatch and zone-fit scoring.',
    addLabel: 'Add zone',
  },
  vehicles: {
    label: 'Vehicles',
    description: 'Fleet vehicles with capacity limits and status.',
    addLabel: 'Add vehicle',
  },
};

export function AdminPage() {
  const [tab, setTab] = useState<TabKey>('users');
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ tone: 'success', message });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  // Tab count badges (users list is unpaginated; the others carry meta.total).
  const usersQ = useUsersList();
  const zonesQ = useZonesList({ limit: 1 });
  const vehiclesQ = useVehiclesList({ limit: 1 });
  const counts: Record<TabKey, number | undefined> = {
    users: usersQ.data?.length,
    zones: zonesQ.data?.meta?.total,
    vehicles: vehiclesQ.data?.meta?.total,
  };

  function switchTab(next: TabKey) {
    setAdding(false);
    setTab(next);
  }

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <Card className="overflow-hidden">
        <div
          className="flex items-center gap-1 border-b px-4"
          style={{ borderColor: 'var(--color-border)' }}
          role="tablist"
        >
          {(Object.keys(TAB_META) as TabKey[]).map((key) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                className="ring-focus flex h-11 items-center gap-2 border-b-2 px-3 text-[13px] font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--color-primary)' : 'transparent',
                  color: active
                    ? 'var(--color-primary)'
                    : 'var(--color-text-muted)',
                }}
              >
                {TAB_META[key].label}
                {counts[key] !== undefined && (
                  <Chip size="sm" tone={active ? 'primary' : 'neutral'}>
                    {counts[key]}
                  </Chip>
                )}
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <p
            className="flex-1 text-[12.5px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {TAB_META[tab].description}
          </p>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            {TAB_META[tab].addLabel}
          </Button>
        </div>

        {tab === 'users' && (
          <UsersTab
            adding={adding}
            onCloseAdd={() => setAdding(false)}
            onSaved={showToast}
          />
        )}
        {tab === 'zones' && (
          <ZonesTab
            adding={adding}
            onCloseAdd={() => setAdding(false)}
            onSaved={showToast}
          />
        )}
        {tab === 'vehicles' && (
          <VehiclesTab
            adding={adding}
            onCloseAdd={() => setAdding(false)}
            onSaved={showToast}
          />
        )}
      </Card>

      <Toast toast={toast} />
    </div>
  );
}
