import { TONE, type Tone } from '../../lib/tone';

export function Meter({
  value,
  tone = 'primary',
  height = 6,
}: {
  value: number;
  tone?: Tone;
  height?: number;
}) {
  return (
    <span
      className="block overflow-hidden rounded-full"
      style={{ background: 'var(--color-surface-alt)', height }}
    >
      <span
        className="block h-full rounded-full transition-all"
        style={{
          width: `${Math.max(2, value * 100)}%`,
          background: TONE[tone].fg,
        }}
      />
    </span>
  );
}
