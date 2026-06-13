import type { ReactNode } from 'react';
import type {
  DeliveryDtoStatus,
  DriverDtoAvailability,
  DeliveryDtoPriority,
} from '@logidash/api-client';
import {
  TONE,
  DELIVERY_TONE,
  DELIVERY_LABEL,
  AVAIL_TONE,
  PRIORITY_TONE,
  SLA_TONE,
  SLA_LABEL,
  scoreTone,
  type Tone,
} from '../../lib/tone';
import { deadlineState } from '../../lib/format';

type ChipSize = 'sm' | 'md';

interface ChipProps {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  outline?: boolean;
  size?: ChipSize;
  className?: string;
}

export function Chip({
  tone = 'neutral',
  children,
  dot = false,
  outline = false,
  size = 'md',
  className = '',
}: ChipProps) {
  const t = TONE[tone];
  const pad = size === 'sm' ? '1px 8px' : '2px 10px';
  const fs = size === 'sm' ? 11.5 : 12;
  const style = outline
    ? {
        color: t.fg,
        background: 'transparent',
        border: `1px solid ${t.fg}`,
        padding: pad,
        fontSize: fs,
        lineHeight: 1.4,
      }
    : {
        color: t.fg,
        background: t.bg,
        border: '1px solid transparent',
        padding: pad,
        fontSize: fs,
        lineHeight: 1.4,
      };
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ' +
        className
      }
      style={style}
    >
      {dot && (
        <span
          className="rounded-full"
          style={{ width: 6, height: 6, background: t.fg }}
        />
      )}
      {children}
    </span>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StatusChip({
  status,
  size = 'md',
}: {
  status: DeliveryDtoStatus;
  size?: ChipSize;
}) {
  return (
    <Chip tone={DELIVERY_TONE[status]} dot size={size}>
      {DELIVERY_LABEL[status]}
    </Chip>
  );
}

export function AvailabilityChip({
  value,
  size = 'md',
}: {
  value: DriverDtoAvailability;
  size?: ChipSize;
}) {
  return (
    <Chip tone={AVAIL_TONE[value]} dot size={size}>
      {capitalize(value)}
    </Chip>
  );
}

export function PriorityChip({
  value,
  size = 'md',
}: {
  value: DeliveryDtoPriority;
  size?: ChipSize;
}) {
  return (
    <Chip tone={PRIORITY_TONE[value]} size={size}>
      {capitalize(value)}
    </Chip>
  );
}

export function SlaChip({
  iso,
  now,
  size = 'md',
}: {
  iso: string;
  now?: number;
  size?: ChipSize;
}) {
  const state = deadlineState(iso, now);
  return (
    <Chip tone={SLA_TONE[state]} dot size={size}>
      {SLA_LABEL[state]}
    </Chip>
  );
}

export function ScoreChip({
  score,
  eligible = true,
  size = 'md',
}: {
  score: number;
  eligible?: boolean;
  size?: 'md' | 'lg';
}) {
  if (!eligible) {
    return (
      <span
        className="tnum inline-flex items-center justify-center rounded-full font-semibold"
        style={{
          color: 'var(--color-danger)',
          border: '1px solid var(--color-danger)',
          background: 'transparent',
          padding: size === 'lg' ? '3px 12px' : '2px 9px',
          fontSize: size === 'lg' ? 14 : 12.5,
        }}
      >
        Ineligible
      </span>
    );
  }
  const t = TONE[scoreTone(score)];
  return (
    <span
      className="tnum inline-flex items-center justify-center rounded-full font-semibold"
      style={{
        color: t.fg,
        background: t.bg,
        padding: size === 'lg' ? '3px 12px' : '2px 9px',
        fontSize: size === 'lg' ? 15 : 12.5,
        minWidth: size === 'lg' ? 46 : 36,
      }}
    >
      {score}
    </span>
  );
}
