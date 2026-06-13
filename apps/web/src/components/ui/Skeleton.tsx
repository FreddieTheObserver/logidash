import type { CSSProperties } from 'react';

export function Skeleton({
  w = '100%',
  h = 12,
  className = '',
  style,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={'skeleton block ' + className}
      style={{ width: w, height: h, ...style }}
    />
  );
}
