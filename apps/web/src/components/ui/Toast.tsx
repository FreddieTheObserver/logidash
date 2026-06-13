import { TONE, type Tone } from '../../lib/tone';
import { ICONS, type IconName } from './icons';

export interface ToastData {
  message: string;
  tone?: Tone;
  icon?: IconName;
}

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  const t = TONE[toast.tone ?? 'success'];
  const Cmp = ICONS[toast.icon ?? 'check'];
  return (
    <div className="animate-fade fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        className="bg-surface flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-[13px]"
        style={{
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: 20, height: 20, background: t.bg, color: t.fg }}
        >
          <Cmp size={13} />
        </span>
        <span style={{ color: 'var(--color-text)' }}>{toast.message}</span>
      </div>
    </div>
  );
}
