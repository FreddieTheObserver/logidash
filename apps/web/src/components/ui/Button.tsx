import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { ICONS, type IconName } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
  lg: 'h-10 px-4 text-[14px] gap-2',
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'border bg-surface hover:bg-surface-alt',
  ghost: 'hover:bg-surface-alt',
  danger: 'text-white',
};

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    borderColor: 'var(--color-primary)',
  },
  danger: {
    background: 'var(--color-danger)',
    borderColor: 'var(--color-danger)',
  },
  secondary: {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
  },
  ghost: { color: 'var(--color-text-muted)' },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const Lead = icon ? ICONS[icon] : null;
  const Trail = iconRight ? ICONS[iconRight] : null;
  const iSize = size === 'sm' ? 14 : 16;
  const base =
    'ring-focus inline-flex items-center justify-center font-medium rounded-md transition-colors select-none disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <button
      className={`${base} ${SIZES[size]} ${VARIANT_CLASS[variant]} ${className}`}
      style={VARIANT_STYLE[variant]}
      disabled={disabled}
      {...rest}
      onMouseEnter={(e) => {
        if (variant === 'primary' && !disabled)
          e.currentTarget.style.background = 'var(--color-primary-hover)';
      }}
      onMouseLeave={(e) => {
        if (variant === 'primary')
          e.currentTarget.style.background = 'var(--color-primary)';
      }}
    >
      {Lead && <Lead size={iSize} />}
      {children}
      {Trail && <Trail size={iSize} />}
    </button>
  );
}
