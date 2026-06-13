import { useState, type FormEvent } from 'react';
import { useLogin } from '../../app/auth/useLogin';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Field, Input } from '../../components/ui/Field';
import { ICONS } from '../../components/ui/icons';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demo-accounts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SCORECARD = [
  { label: 'Zone fit', w: '0.30', v: 0.95 },
  { label: 'Route proximity', w: '0.25', v: 0.8 },
  { label: 'Remaining capacity', w: '0.15', v: 0.86 },
  { label: 'Workload balance', w: '0.15', v: 0.7 },
];

export function LoginPage() {
  const { login, pending, error } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const emailErr =
    touched && !EMAIL_RE.test(email) ? 'Enter a valid work email.' : null;
  const pwErr =
    touched && password.length < 6
      ? 'Password must be at least 6 characters.'
      : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!EMAIL_RE.test(email) || password.length < 6) return;
    void login({ email, password });
  }

  const Route = ICONS.route;
  const Sparkles = ICONS.sparkles;
  const Layers = ICONS.layers;
  const Alert = ICONS.alert;

  return (
    <div className="flex min-h-full" style={{ background: 'var(--color-bg)' }}>
      {/* left — form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full" style={{ maxWidth: 360 }}>
          <div className="mb-8 flex items-center gap-2.5">
            <span
              className="flex items-center justify-center rounded-md"
              style={{
                width: 32,
                height: 32,
                background: 'var(--color-primary)',
              }}
            >
              <Route size={19} className="text-white" strokeWidth={2} />
            </span>
            <span
              className="text-[18px] font-semibold tracking-tight"
              style={{ color: 'var(--color-text)' }}
            >
              logidash
            </span>
          </div>

          <h1
            className="text-[22px] font-semibold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            Sign in to the command center
          </h1>
          <p
            className="mb-7 mt-1.5 text-[13px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Dispatch operations, driver recommendations, and the audit trail.
          </p>

          {error && (
            <div
              className="mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
              style={{
                background: 'var(--tint-danger)',
                color: 'var(--color-danger)',
              }}
              role="alert"
            >
              <Alert size={15} />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Work email" error={emailErr} required>
              <Input
                type="email"
                value={email}
                placeholder="you@logidash.io"
                autoComplete="username"
                invalid={!!emailErr}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </Field>
            <Field label="Password" error={pwErr} required>
              <Input
                type="password"
                value={password}
                placeholder="••••••••"
                autoComplete="current-password"
                invalid={!!pwErr}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </Field>
            <div className="flex items-center justify-between pt-1">
              <label
                className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <input
                  type="checkbox"
                  className="ring-focus"
                  style={{
                    accentColor: 'var(--color-primary)',
                    width: 15,
                    height: 15,
                  }}
                />
                Remember me
              </label>
              <a
                href="#"
                className="ring-focus text-[13px] font-medium hover:underline"
                style={{ color: 'var(--color-primary)' }}
                onClick={(e) => e.preventDefault()}
              >
                Forgot?
              </a>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={pending}
              iconRight={pending ? undefined : 'arrowRight'}
            >
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-8">
            <div
              className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Demo accounts — one click
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => {
                const Cmp = ICONS[a.icon];
                return (
                  <button
                    key={a.role}
                    type="button"
                    onClick={() =>
                      void login({ email: a.email, password: DEMO_PASSWORD })
                    }
                    disabled={pending}
                    className="ring-focus bg-surface hover:bg-surface-alt flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <Cmp size={15} style={{ color: 'var(--color-primary)' }} />
                    <span className="flex min-w-0 flex-col">
                      <span
                        className="block truncate text-[12.5px] font-medium capitalize"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {a.role}
                      </span>
                      <span
                        className="block truncate text-[11px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {a.name}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* right — brand panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden border-l p-12 lg:flex"
        style={{
          width: 460,
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div
          className="flex items-center gap-2 text-[12.5px] font-medium"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Chip tone="warning" size="sm">
            <Layers size={12} /> Staging
          </Chip>
          <span>v1.4 · build 2026.06</span>
        </div>

        <div className="space-y-5">
          <Chip tone="primary">
            <Sparkles size={13} /> Explainable dispatch
          </Chip>
          <p
            className="text-[22px] font-medium leading-snug"
            style={{ color: 'var(--color-text)' }}
          >
            Rank every eligible driver{' '}
            <span style={{ color: 'var(--color-primary)' }}>0–100</span> — with
            the reasons behind the score.
          </p>
          <div
            className="space-y-3 rounded-lg border p-4"
            style={{
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {SCORECARD.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <span
                  className="w-32 shrink-0 text-[12px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {f.label}
                </span>
                <span
                  className="block flex-1 overflow-hidden rounded-full"
                  style={{ height: 6, background: 'var(--color-surface-alt)' }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${f.v * 100}%`,
                      background: 'var(--color-primary)',
                    }}
                  />
                </span>
                <span
                  className="tnum w-8 text-right text-[11.5px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {f.w}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          Internal operations tool · WCAG AA · keyboard-first
        </p>
      </div>
    </div>
  );
}
