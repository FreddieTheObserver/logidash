import type { HTMLAttributes } from 'react';

export function Card({
  children,
  className = '',
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={'bg-surface border rounded-lg ' + className}
      style={{
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--shadow-card)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
