import type { ReactNode } from 'react';
import { ICONS, type IconName } from './icons';

export function EmptyState({
  icon = 'inbox',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const Cmp = ICONS[icon];
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: 'var(--color-surface-alt)',
          color: 'var(--color-text-muted)',
        }}
      >
        <Cmp size={24} />
      </div>
      <div
        className="text-[16px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
      </div>
      {body && (
        <div
          className="mt-1 max-w-sm text-[13px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {body}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
