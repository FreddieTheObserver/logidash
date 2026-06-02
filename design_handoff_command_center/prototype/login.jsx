/* Login screen. Exposes window.LoginScreen. */
(function () {
  "use strict";
  const { useState } = React;
  const Icon = window.Icon;
  const { Button, Field, Input, Chip } = window.UI;
  const DB = window.DB;

  function LoginScreen({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [touched, setTouched] = useState(false);
    const [pending, setPending] = useState(false);

    const emailErr = touched && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "Enter a valid work email." : null;
    const pwErr = touched && password.length < 6 ? "Password must be at least 6 characters." : null;

    function submit(e) {
      e.preventDefault();
      setTouched(true);
      if (emailErr || pwErr || !email || !password) return;
      setPending(true);
      const acct = DB.demoAccounts.find((a) => a.email === email) || DB.demoAccounts[1];
      setTimeout(() => onLogin(acct.role), 650);
    }

    function quick(acct) {
      setEmail(acct.email); setPassword("demo-pass"); setTouched(false); setPending(true);
      setTimeout(() => onLogin(acct.role), 450);
    }

    return (
      <div className="min-h-full flex" style={{ background: "var(--color-bg)" }}>
        {/* left — form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full" style={{ maxWidth: 360 }}>
            <div className="flex items-center gap-2.5 mb-8">
              <span className="flex items-center justify-center rounded-md" style={{ width: 32, height: 32, background: "var(--color-primary)" }}>
                <Icon name="route" size={19} className="text-white" strokeWidth={2} />
              </span>
              <span className="font-semibold text-[18px] tracking-tight" style={{ color: "var(--color-text)" }}>logidash</span>
            </div>

            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>Sign in to the command center</h1>
            <p className="text-[13px] mt-1.5 mb-7" style={{ color: "var(--color-text-muted)" }}>Dispatch operations, driver recommendations, and the audit trail.</p>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label="Work email" error={emailErr} required>
                <Input type="email" value={email} placeholder="you@logidash.io" autoComplete="username"
                  invalid={!!emailErr} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} />
              </Field>
              <Field label="Password" error={pwErr} required>
                <Input type="password" value={password} placeholder="••••••••" autoComplete="current-password"
                  invalid={!!pwErr} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched(true)} />
              </Field>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                  <input type="checkbox" className="ring-focus" style={{ accentColor: "var(--color-primary)", width: 15, height: 15 }} /> Remember me
                </label>
                <a href="#" className="ring-focus text-[13px] font-medium hover:underline" style={{ color: "var(--color-primary)" }} onClick={(e) => e.preventDefault()}>Forgot?</a>
              </div>
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending} iconRight={pending ? undefined : "arrowRight"}>
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-8">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--color-text-muted)" }}>Demo accounts — one click</div>
              <div className="grid grid-cols-2 gap-2">
                {DB.demoAccounts.map((a) => (
                  <button key={a.role} onClick={() => quick(a)}
                    className="ring-focus flex items-center gap-2 px-3 py-2 rounded-md border bg-surface text-left hover:bg-surface-alt transition-colors"
                    style={{ borderColor: "var(--color-border)" }}>
                    <Icon name={a.role === "admin" ? "shield" : a.role === "dispatcher" ? "route" : a.role === "driver" ? "truck" : "eye"} size={15} style={{ color: "var(--color-primary)" }} />
                    <span className="min-w-0 flex flex-col">
                      <span className="block text-[12.5px] font-medium capitalize truncate" style={{ color: "var(--color-text)" }}>{a.role}</span>
                      <span className="block text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>{a.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* right — brand panel */}
        <div className="hidden lg:flex flex-col justify-between p-12 border-l relative overflow-hidden" style={{ width: 460, background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--color-text-muted)" }}>
            <Chip tone="warning" size="sm"><Icon name="layers" size={12} /> Staging</Chip>
            <span>v1.4 · build 2026.06</span>
          </div>

          <div className="space-y-5">
            <Chip tone="primary"><Icon name="sparkles" size={13} /> Explainable dispatch</Chip>
            <p className="text-[22px] leading-snug font-medium" style={{ color: "var(--color-text)" }}>
              Rank every eligible driver <span style={{ color: "var(--color-primary)" }}>0–100</span> — with the reasons behind the score.
            </p>
            {/* mini scorecard preview */}
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--color-border)", boxShadow: "var(--shadow-card)" }}>
              {[
                { label: "Zone fit", w: "0.30", v: 0.95 },
                { label: "Route proximity", w: "0.25", v: 0.8 },
                { label: "Remaining capacity", w: "0.15", v: 0.86 },
                { label: "Workload balance", w: "0.15", v: 0.7 },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="text-[12px] w-32 shrink-0" style={{ color: "var(--color-text-muted)" }}>{f.label}</span>
                  <span className="flex-1 block rounded-full overflow-hidden" style={{ height: 6, background: "var(--color-surface-alt)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${f.v * 100}%`, background: "var(--color-primary)" }} />
                  </span>
                  <span className="tnum text-[11.5px] w-8 text-right" style={{ color: "var(--color-text-muted)" }}>{f.w}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>Internal operations tool · WCAG AA · keyboard-first</p>
        </div>
      </div>
    );
  }

  window.LoginScreen = LoginScreen;
})();
