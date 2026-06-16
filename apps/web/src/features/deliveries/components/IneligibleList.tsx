import { useState } from 'react';
import type { RecommendationCandidateDto } from '@logidash/api-client';
import { Avatar } from '../../../components/ui/Avatar';
import { ScoreChip } from '../../../components/ui/Chip';
import { ICONS } from '../../../components/ui/icons';

function driverInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function IneligibleList({
  candidates,
  zoneCode,
}: {
  candidates: RecommendationCandidateDto[];
  zoneCode: (id: string) => string;
}) {
  const [shown, setShown] = useState(true);
  const ChevronDown = ICONS.chevronDown;
  const X = ICONS.x;

  if (candidates.length === 0) return null;

  return (
    <div className="px-4 pb-4">
      <button
        onClick={() => setShown((s) => !s)}
        className="ring-focus mb-2.5 flex items-center gap-2 text-[12.5px] font-medium"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <ChevronDown
          size={14}
          style={{
            transform: shown ? 'none' : 'rotate(-90deg)',
            transition: 'transform .18s',
          }}
        />
        Ineligible drivers ({candidates.length}) — shown with reasons
      </button>
      {shown && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {candidates.map((c) => {
            const driver = c.driver;
            return (
              <div
                key={c.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-surface-alt)',
                }}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    initials={driverInitials(driver.name)}
                    name={driver.name}
                    id={driver.id}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {driver.name}
                    </div>
                    <div
                      className="text-[12px] capitalize"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {driver.vehicle?.type ?? 'No vehicle'} &middot;{' '}
                      {zoneCode(driver.baseZoneId)}
                    </div>
                  </div>
                  <ScoreChip score={c.score} eligible={false} />
                </div>
                <ul className="mt-2.5 space-y-1 pl-1">
                  {(c.ineligibleReasons ?? []).map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <X
                        size={13}
                        style={{ color: 'var(--color-danger)', marginTop: 2 }}
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
