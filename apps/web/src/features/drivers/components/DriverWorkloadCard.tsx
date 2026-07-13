import type { DriverDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Meter } from '../../../components/ui/Meter';
import { workloadTone } from '../driver-filters';

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="rounded-md p-3"
      style={{ background: 'var(--color-surface-alt)' }}
    >
      <div
        className="tnum text-[20px] font-semibold leading-none"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[11.5px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
    </div>
  );
}

export function DriverWorkloadCard({ driver }: { driver: DriverDto }) {
  const { activeJobCount: active, maxConcurrentJobs: max } = driver;
  return (
    <Card className="p-4">
      <h2
        className="text-[13.5px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Workload & capacity
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <StatBox value={String(active)} label="Active jobs" />
        <StatBox value={String(max)} label="Job slots" />
        <StatBox
          value={driver.vehicle ? `${driver.vehicle.capacityWeight} kg` : '—'}
          label="Vehicle capacity"
        />
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span
            className="text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Job slots used
          </span>
          <span
            className="tnum text-[12px] font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            {active}/{max}
          </span>
        </div>
        <div className="mt-1.5">
          <Meter
            value={max ? active / max : 0}
            tone={workloadTone(active, max)}
          />
        </div>
      </div>
    </Card>
  );
}
