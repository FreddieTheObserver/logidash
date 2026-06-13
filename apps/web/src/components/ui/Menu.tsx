import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ICONS, type IconName } from './icons';

export function Menu({
  trigger,
  children,
  align = 'right',
}: {
  trigger: ReactElement<HTMLAttributes<HTMLElement>>;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      {cloneElement(trigger, {
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
      })}
      {open && (
        <div
          className={
            'bg-surface animate-fade absolute z-40 mt-1.5 min-w-[180px] rounded-md border py-1 ' +
            (align === 'right' ? 'right-0' : 'left-0')
          }
          style={{
            borderColor: 'var(--color-border)',
            boxShadow: 'var(--shadow-pop)',
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  danger,
  onClick,
  disabled,
}: {
  icon?: IconName;
  children: ReactNode;
  danger?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Cmp = icon ? ICONS[icon] : null;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hover:bg-surface-alt flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
    >
      {Cmp && <Cmp size={15} />}
      {children}
    </button>
  );
}
