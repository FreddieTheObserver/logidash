import { useState } from 'react';
import type { RecommendationCandidateDto } from '@logidash/api-client';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Chip, ScoreChip } from '../../../components/ui/Chip';
import { ICONS } from '../../../components/ui/icons';
import { scoreTone } from '../../../lib/tone';
import { TONE } from '../../../lib/tone';
import { FACTOR_META } from './factor-meta';
import { FactorBreakdown } from './FactorBreakdown';

function driverInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function CandidateCard({
  candidate,
  zoneCode,
  isTopPick,
  isAssigned,
  canAssign,
  onAssign,
}: {
  candidate: RecommendationCandidateDto;
  zoneCode: (id: string) => string;
  isTopPick: boolean;
  isAssigned: boolean;
  canAssign: boolean;
  onAssign: (candidate: RecommendationCandidateDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ChevronDown = ICONS.chevronDown;
  const Sparkles = ICONS.sparkles;
  const driver = candidate.driver;

  return (
    <div
      className="rounded-lg border transition-colors"
      style={{
        borderColor: isAssigned
          ? 'var(--color-success)'
          : isTopPick
            ? 'var(--color-primary)'
            : 'var(--color-border)',
        background: 'var(--color-surface)',
        boxShadow:
          isTopPick && !isAssigned ? '0 0 0 1px var(--color-primary)' : 'none',
      }}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          className="tnum flex shrink-0 items-center justify-center rounded-md text-[13px] font-semibold"
          style={{
            width: 26,
            height: 26,
            background: isTopPick
              ? 'var(--color-primary)'
              : 'var(--color-surface-alt)',
            color: isTopPick ? '#fff' : 'var(--color-text-muted)',
          }}
        >
          {candidate.rank ?? '—'}
        </span>
        <Avatar
          initials={driverInitials(driver.name)}
          name={driver.name}
          id={driver.id}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-[13.5px] font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {driver.name}
            </span>
            {isTopPick && (
              <Chip tone="primary" size="sm">
                <Sparkles size={11} />
                Top pick
              </Chip>
            )}
            {isAssigned && (
              <Chip tone="success" size="sm" dot>
                Assigned
              </Chip>
            )}
          </div>
          <div
            className="mt-0.5 flex items-center gap-2 text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span className="capitalize">
              {driver.vehicle?.type ?? 'No vehicle'}
            </span>
            <span style={{ opacity: 0.5 }}>&middot;</span>
            <span>{zoneCode(driver.baseZoneId)}</span>
            <span style={{ opacity: 0.5 }}>&middot;</span>
            <span className="tnum">
              {driver.activeJobCount}/{driver.maxConcurrentJobs} jobs
            </span>
          </div>
        </div>
        <div className="shrink-0 text-center">
          <ScoreChip score={candidate.score} size="lg" />
          <div
            className="mt-0.5 text-[10.5px] uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}
          >
            score
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canAssign && (
            <Button
              variant="primary"
              size="sm"
              icon={isAssigned ? 'check' : undefined}
              disabled={isAssigned}
              onClick={() => onAssign(candidate)}
            >
              {isAssigned ? 'Assigned' : 'Assign'}
            </Button>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label="Toggle breakdown"
            className="ring-focus flex items-center justify-center rounded-md border transition-colors hover:bg-surface-alt"
            style={{
              width: 32,
              height: 32,
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            <ChevronDown
              size={16}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform .18s',
              }}
            />
          </button>
        </div>
      </div>
      {!expanded && (
        <div className="flex flex-wrap items-center gap-3 px-3 pb-3 pl-[52px]">
          {candidate.explanation.map((f) => {
            const meta = FACTOR_META[f.factor];
            const Icon = ICONS[meta.icon];
            return (
              <span
                key={f.factor}
                className="flex items-center gap-1.5"
                title={`${meta.label}: +${f.weighted.toFixed(1)}`}
              >
                <Icon size={12} style={{ color: 'var(--color-text-muted)' }} />
                <span
                  className="block overflow-hidden rounded-full"
                  style={{
                    width: 36,
                    height: 5,
                    background: 'var(--color-surface-alt)',
                  }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, f.rawValue * 100))}%`,
                      background: TONE[scoreTone(f.rawValue * 100)].fg,
                    }}
                  />
                </span>
              </span>
            );
          })}
        </div>
      )}
      {expanded && (
        <FactorBreakdown
          explanation={candidate.explanation}
          score={candidate.score}
        />
      )}
    </div>
  );
}
