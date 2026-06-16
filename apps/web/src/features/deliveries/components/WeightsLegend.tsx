import type { ScoringWeightsDto } from '@logidash/api-client';
import { ICONS } from '../../../components/ui/icons';
import { FACTOR_META } from './factor-meta';

export function WeightsLegend({ weights }: { weights: ScoringWeightsDto }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2.5"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface-alt)',
      }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Weights
      </span>
      {(Object.keys(FACTOR_META) as (keyof ScoringWeightsDto)[]).map((k) => {
        const meta = FACTOR_META[k];
        const Icon = ICONS[meta.icon];
        return (
          <span
            key={k}
            className="flex items-center gap-1.5 text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Icon size={13} />
            {meta.label}
            <span
              className="tnum font-medium"
              style={{ color: 'var(--color-text)' }}
            >
              {weights[k].toFixed(2)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
