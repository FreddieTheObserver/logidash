/* logidash UI primitives + helpers. Exposed on window.UI. */
(function () {
  "use strict";
  const { useState, useRef, useEffect } = React;
  const Icon = window.Icon;

  /* ---------- status / semantic maps ---------- */
  const TONE = {
    success: { fg: "var(--color-success)", bg: "var(--tint-success)" },
    warning: { fg: "var(--color-warning)", bg: "var(--tint-warning)" },
    danger:  { fg: "var(--color-danger)",  bg: "var(--tint-danger)" },
    info:    { fg: "var(--color-info)",     bg: "var(--tint-info)" },
    neutral: { fg: "var(--color-neutral)",  bg: "var(--tint-neutral)" },
    primary: { fg: "var(--color-primary)",  bg: "var(--tint-primary)" },
  };

  const DELIVERY_TONE = {
    draft: "neutral", ready: "info", assigned: "primary", picked_up: "info",
    in_transit: "info", delivered: "success", failed: "danger", cancelled: "neutral",
  };
  const DELIVERY_LABEL = {
    draft: "Draft", ready: "Ready", assigned: "Assigned", picked_up: "Picked up",
    in_transit: "In transit", delivered: "Delivered", failed: "Failed", cancelled: "Cancelled",
  };
  const AVAIL_TONE = { available: "success", busy: "warning", offline: "neutral", inactive: "neutral" };
  const PRIORITY_TONE = { low: "neutral", normal: "info", high: "warning", urgent: "danger" };

  function scoreTone(score) {
    if (score >= 80) return "success";
    if (score >= 50) return "warning";
    return "neutral";
  }

  /* ---------- time helpers ---------- */
  const NOW = window.DB.now.getTime();
  function fromNow(iso) {
    const t = new Date(iso).getTime();
    const diff = t - NOW;
    const abs = Math.abs(diff);
    const m = Math.round(abs / 60000);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    let s;
    if (m < 1) s = "now";
    else if (h < 1) s = `${m}m`;
    else if (h < 24) s = mm ? `${h}h ${mm}m` : `${h}h`;
    else s = `${Math.floor(h / 24)}d`;
    if (m < 1) return "now";
    return diff < 0 ? `${s} ago` : `in ${s}`;
  }
  function deadlineState(iso) {
    const diff = new Date(iso).getTime() - NOW;
    if (diff < 0) return "breached";
    if (diff < 90 * 60000) return "at-risk";
    return "on-track";
  }
  const SLA_TONE = { "on-track": "success", "at-risk": "warning", breached: "danger" };
  const SLA_LABEL = { "on-track": "On track", "at-risk": "At risk", breached: "Breached" };

  /* ---------- Chip ---------- */
  function Chip({ tone = "neutral", children, dot = false, outline = false, size = "md", className = "" }) {
    const t = TONE[tone];
    const pad = size === "sm" ? "1px 8px" : "2px 10px";
    const fs = size === "sm" ? 11.5 : 12;
    const style = outline
      ? { color: t.fg, background: "transparent", border: `1px solid ${t.fg}`, padding: pad, fontSize: fs }
      : { color: t.fg, background: t.bg, border: "1px solid transparent", padding: pad, fontSize: fs };
    return (
      <span className={"inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap " + className}
            style={{ ...style, lineHeight: 1.4 }}>
        {dot && <span className="rounded-full" style={{ width: 6, height: 6, background: t.fg }} />}
        {children}
      </span>
    );
  }

  function StatusChip({ status, size = "md" }) {
    return <Chip tone={DELIVERY_TONE[status]} dot size={size}>{DELIVERY_LABEL[status]}</Chip>;
  }
  function AvailabilityChip({ value, size = "md" }) {
    const label = value.charAt(0).toUpperCase() + value.slice(1);
    return <Chip tone={AVAIL_TONE[value]} dot size={size}>{label}</Chip>;
  }
  function PriorityChip({ value, size = "md" }) {
    const label = value.charAt(0).toUpperCase() + value.slice(1);
    return <Chip tone={PRIORITY_TONE[value]} size={size}>{label}</Chip>;
  }
  function SlaChip({ iso, size = "md" }) {
    const st = deadlineState(iso);
    return <Chip tone={SLA_TONE[st]} dot size={size}>{SLA_LABEL[st]}</Chip>;
  }

  function ScoreChip({ score, eligible = true, size = "md" }) {
    if (!eligible) {
      return (
        <span className="inline-flex items-center justify-center rounded-full font-semibold tnum"
          style={{ color: "var(--color-danger)", border: "1px solid var(--color-danger)", background: "transparent",
            padding: size === "lg" ? "3px 12px" : "2px 9px", fontSize: size === "lg" ? 14 : 12.5 }}>
          Ineligible
        </span>
      );
    }
    const t = TONE[scoreTone(score)];
    return (
      <span className="inline-flex items-center justify-center rounded-full font-semibold tnum"
        style={{ color: t.fg, background: t.bg, padding: size === "lg" ? "3px 12px" : "2px 9px",
          fontSize: size === "lg" ? 15 : 12.5, minWidth: size === "lg" ? 46 : 36 }}>
        {score}
      </span>
    );
  }

  /* ---------- Button ---------- */
  function Button({ variant = "secondary", size = "md", icon, iconRight, children, className = "", disabled, ...rest }) {
    const sizes = {
      sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
      md: "h-9 px-3.5 text-[13px] gap-2",
      lg: "h-10 px-4 text-[14px] gap-2",
    };
    const base = "ring-focus inline-flex items-center justify-center font-medium rounded-md transition-colors select-none disabled:opacity-50 disabled:cursor-not-allowed";
    const variants = {
      primary: "text-white",
      secondary: "border bg-surface hover:bg-surface-alt",
      ghost: "hover:bg-surface-alt",
      danger: "text-white",
    };
    const styleMap = {
      primary: { background: "var(--color-primary)", borderColor: "var(--color-primary)" },
      danger: { background: "var(--color-danger)", borderColor: "var(--color-danger)" },
      secondary: { borderColor: "var(--color-border)", color: "var(--color-text)" },
      ghost: { color: "var(--color-text-muted)" },
    };
    const iSize = size === "sm" ? 14 : 16;
    return (
      <button
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        style={styleMap[variant]}
        disabled={disabled}
        onMouseEnter={(e) => { if (variant === "primary" && !disabled) e.currentTarget.style.background = "var(--color-primary-hover)"; }}
        onMouseLeave={(e) => { if (variant === "primary") e.currentTarget.style.background = "var(--color-primary)"; }}
        {...rest}
      >
        {icon && <Icon name={icon} size={iSize} />}
        {children}
        {iconRight && <Icon name={iconRight} size={iSize} />}
      </button>
    );
  }

  /* ---------- Card ---------- */
  function Card({ children, className = "", style, ...rest }) {
    return (
      <div className={"bg-surface border rounded-lg " + className}
        style={{ borderColor: "var(--color-border)", boxShadow: "var(--shadow-card)", ...style }} {...rest}>
        {children}
      </div>
    );
  }

  /* ---------- Avatar ---------- */
  const AV_COLORS = ["#2563eb", "#0891b2", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0d9488", "#ca8a04"];
  function Avatar({ initials, name, size = 32, id = "" }) {
    const idx = (id || name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length;
    const bg = AV_COLORS[idx];
    return (
      <span className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0"
        style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}
        aria-hidden="true">
        {initials}
      </span>
    );
  }

  /* ---------- Skeleton ---------- */
  function Skeleton({ w = "100%", h = 12, className = "", style }) {
    return <span className={"skeleton block " + className} style={{ width: w, height: h, ...style }} />;
  }

  /* ---------- EmptyState ---------- */
  function EmptyState({ icon = "inbox", title, body, action }) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="flex items-center justify-center rounded-full mb-4"
          style={{ width: 52, height: 52, background: "var(--color-surface-alt)", color: "var(--color-text-muted)" }}>
          <Icon name={icon} size={24} />
        </div>
        <div className="text-[16px] font-semibold" style={{ color: "var(--color-text)" }}>{title}</div>
        {body && <div className="text-[13px] mt-1 max-w-sm" style={{ color: "var(--color-text-muted)" }}>{body}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }

  /* ---------- ErrorState ---------- */
  function ErrorState({ title = "Couldn't load this view", body, onRetry }) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="flex items-center justify-center rounded-full mb-4"
          style={{ width: 52, height: 52, background: "var(--tint-danger)", color: "var(--color-danger)" }}>
          <Icon name="alert" size={24} />
        </div>
        <div className="text-[16px] font-semibold" style={{ color: "var(--color-text)" }}>{title}</div>
        {body && <div className="text-[13px] mt-1 max-w-sm" style={{ color: "var(--color-text-muted)" }}>{body}</div>}
        {onRetry && <div className="mt-4"><Button variant="secondary" icon="refresh" onClick={onRetry}>Retry</Button></div>}
      </div>
    );
  }

  /* ---------- Field (label above input) ---------- */
  function Field({ label, hint, error, children, required }) {
    return (
      <label className="block">
        <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
          {label}{required && <span style={{ color: "var(--color-danger)" }}> *</span>}
        </span>
        {children}
        {error
          ? <span className="flex items-center gap-1 text-[12px] mt-1.5" style={{ color: "var(--color-danger)" }}><Icon name="alert" size={13} />{error}</span>
          : hint ? <span className="block text-[12px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>{hint}</span> : null}
      </label>
    );
  }

  function Input({ invalid, className = "", ...rest }) {
    return (
      <input
        className={"ring-focus w-full h-9 px-3 text-[13px] rounded-md bg-surface border outline-none transition-colors " + className}
        style={{ borderColor: invalid ? "var(--color-danger)" : "var(--color-border)", color: "var(--color-text)" }}
        {...rest}
      />
    );
  }

  function Select({ children, className = "", value, onChange, ...rest }) {
    return (
      <div className="relative">
        <select
          value={value} onChange={onChange}
          className={"ring-focus w-full h-9 pl-3 pr-8 text-[13px] rounded-md bg-surface border outline-none appearance-none cursor-pointer transition-colors " + className}
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--color-text-muted)" }} />
      </div>
    );
  }

  /* ---------- Tooltip-ish meter bar ---------- */
  function Meter({ value, tone = "primary", height = 6 }) {
    const t = TONE[tone];
    return (
      <span className="block rounded-full overflow-hidden" style={{ background: "var(--color-surface-alt)", height }}>
        <span className="block h-full rounded-full transition-all" style={{ width: `${Math.max(2, value * 100)}%`, background: t.fg }} />
      </span>
    );
  }

  /* ---------- Toast ---------- */
  function Toast({ toast }) {
    if (!toast) return null;
    const t = TONE[toast.tone || "success"];
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-surface border text-[13px]"
          style={{ borderColor: "var(--color-border)", boxShadow: "var(--shadow-pop)" }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: t.bg, color: t.fg }}>
            <Icon name={toast.icon || "check"} size={13} />
          </span>
          <span style={{ color: "var(--color-text)" }}>{toast.message}</span>
        </div>
      </div>
    );
  }

  /* ---------- Dropdown menu ---------- */
  function Menu({ trigger, children, align = "right" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, []);
    return (
      <div className="relative" ref={ref}>
        {React.cloneElement(trigger, { onClick: () => setOpen((o) => !o), "aria-expanded": open })}
        {open && (
          <div className={"absolute z-40 mt-1.5 min-w-[180px] py-1 rounded-md bg-surface border animate-fade " + (align === "right" ? "right-0" : "left-0")}
            style={{ borderColor: "var(--color-border)", boxShadow: "var(--shadow-pop)" }}
            onClick={() => setOpen(false)}>
            {children}
          </div>
        )}
      </div>
    );
  }
  function MenuItem({ icon, children, danger, onClick, disabled }) {
    return (
      <button onClick={onClick} disabled={disabled}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ color: danger ? "var(--color-danger)" : "var(--color-text)" }}>
        {icon && <Icon name={icon} size={15} />}{children}
      </button>
    );
  }

  window.UI = {
    TONE, DELIVERY_TONE, DELIVERY_LABEL, AVAIL_TONE, PRIORITY_TONE, SLA_TONE, SLA_LABEL,
    scoreTone, fromNow, deadlineState,
    Chip, StatusChip, AvailabilityChip, PriorityChip, SlaChip, ScoreChip,
    Button, Card, Avatar, Skeleton, EmptyState, ErrorState, Field, Input, Select, Meter, Toast, Menu, MenuItem,
  };
})();
