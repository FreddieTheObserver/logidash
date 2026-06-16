import type { FactorContributionDto } from '@logidash/api-client';
import { Meter } from '../../../components/ui/Meter';
import { ICONS } from '../../../components/ui/icons';
import { scoreTone } from '../../../lib/tone';
import { FACTOR_META } from './factor-meta';

export function FactorBreakdown({
  explanation,
  score,
}: {
  explanation: FactorContributionDto[];
  score: number;
}) {
  return (
    <div className="px-4 pb-4 pt-1">
      <div
        className="overflow-hidden rounded-md border"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="grid items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            gridTemplateColumns: '150px 1fr 56px 60px',
            background: 'var(--color-surface-alt)',
            color: 'var(--color-text-muted)',
            height: 32,
          }}
        >
          <span>Factor</span>
          <span>Normalized</span>
          <span className="text-center">Weight</span>
          <span className="text-right">Points</span>
        </div>
        {explanation.map((f) => {
          const meta = FACTOR_META[f.factor];
          const Icon = ICONS[meta.icon];
          return (
            <div
              key={f.factor}
              className="px-3 py-2.5"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <div
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: '150px 1fr 56px 60px' }}
              >
                <span
                  className="flex items-center gap-2 text-[12.5px] font-medium"
                  style={{ color: 'var(--color-text)' }}
                >
                  <Icon
                    size={14}
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  {meta.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex-1">
                    <Meter
                      value={f.rawValue}
                      tone={scoreTone(f.rawValue * 100)}
                    />
                  </span>
                  <span
                    className="tnum w-8 text-[11.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {f.rawValue.toFixed(2)}
                  </span>
                </span>
                <span
                  className="tnum text-center text-[12px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  &times;{f.weight.toFixed(2)}
                </span>
                <span
                  className="tnum text-right text-[12.5px] font-semibold"
                  style={{ color: 'var(--color-text)' }}
                >
                  +{f.weighted.toFixed(1)}
                </span>
              </div>
              <div
                className="mt-1.5 pl-[22px] text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {f.reason}
                {f.degraded && (
                  <span
                    className="ml-1.5 text-[11px]"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    (estimated)
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div
          className="flex items-center justify-between px-3"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-alt)',
            height: 36,
          }}
        >
          <span
            className="text-[12px] font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Weighted total
          </span>
          <span
            className="tnum text-[14px] font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            = {score} / 100
          </span>
        </div>
      </div>
    </div>
  );
}
