import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { ICONS } from './icons';

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  const Alert = ICONS.alert;
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[12.5px] font-medium"
        style={{ color: 'var(--color-text)' }}
      >
        {label}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </span>
      {children}
      {error ? (
        <span
          className="mt-1.5 flex items-center gap-1 text-[12px]"
          style={{ color: 'var(--color-danger)' }}
        >
          <Alert size={13} />
          {error}
        </span>
      ) : hint ? (
        <span
          className="mt-1.5 block text-[12px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Input({
  invalid,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={
        'ring-focus bg-surface h-9 w-full rounded-md border px-3 text-[13px] outline-none transition-colors ' +
        className
      }
      style={{
        borderColor: invalid ? 'var(--color-danger)' : 'var(--color-border)',
        color: 'var(--color-text)',
      }}
      {...rest}
    />
  );
}

export function Select({
  children,
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const Chevron = ICONS.chevronDown;
  return (
    <div className="relative">
      <select
        className={
          'ring-focus bg-surface h-9 w-full cursor-pointer appearance-none rounded-md border pl-3 pr-8 text-[13px] outline-none transition-colors ' +
          className
        }
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
        {...rest}
      >
        {children}
      </select>
      <Chevron
        size={15}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--color-text-muted)' }}
      />
    </div>
  );
}
