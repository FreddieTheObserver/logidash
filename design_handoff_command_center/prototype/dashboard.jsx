/* Dashboard: metric cards + needs-attention queue. Exposes window.DashboardScreen. */
(function () {
  "use strict";
  const { useState, useEffect } = React;
  const Icon = window.Icon;
  const { Card, Chip, StatusChip, PriorityChip, SlaChip, Button, Skeleton, Avatar, fromNow, deadlineState } = window.UI;
  const DB = window.DB;

  function MetricCard({ icon, tone, label, value, sub, trend, loading }) {
    const t = window.UI.TONE[tone];
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center justify-center rounded-md" style={{ width: 34, height: 34, background: t.bg, color: t.fg }}>
            <Icon name={icon} size={18} />
          </div>
          {trend && !loading && (
            <span className="flex items-center gap-1 text-[11.5px] font-medium" style={{ color: trend.dir === "up" ? "var(--color-danger)" : "var(--color-success)" }}>
              <Icon name="arrowUpRight" size={12} style={{ transform: trend.dir === "down" ? "scaleY(-1)" : "none" }} />{trend.value}
            </span>
          )}
        </div>
        <div className="mt-3">
          {loading
            ? <><Skeleton w={52} h={26} /><Skeleton w={120} h={11} className="mt-2" /></>
            : <>
                <div className="text-[28px] font-semibold tnum leading-none" style={{ color: "var(--color-text)" }}>{value}</div>
                <div className="text-[12.5px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>{label}</div>
                {sub && <div className="text-[11.5px] mt-1" style={{ color: "var(--color-text-muted)" }}>{sub}</div>}
              </>}
        </div>
      </Card>
    );
  }

  function DashboardScreen({ navigate, role }) {
    const [loading, setLoading] = useState(true);
    useEffect(() => { const t = setTimeout(() => setLoading(false), 700); return () => clearTimeout(t); }, []);

    const deliveries = DB.deliveries;
    const pending = deliveries.filter((d) => d.status === "ready").length;
    const active = deliveries.filter((d) => ["assigned", "picked_up", "in_transit"].includes(d.status)).length;
    const open = deliveries.filter((d) => !["delivered", "failed", "cancelled"].includes(d.status));
    const slaRisk = open.filter((d) => deadlineState(d.deadlineAt) !== "on-track").length;
    const availDrivers = DB.drivers.filter((d) => d.availability === "available").length;

    // needs-attention queue: unassigned-but-ready (sorted by deadline) + at-risk/breached open deliveries
    const attention = open
      .filter((d) => d.status === "ready" || deadlineState(d.deadlineAt) !== "on-track")
      .sort((a, b) => new Date(a.deadlineAt) - new Date(b.deadlineAt))
      .slice(0, 6);

    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-6">
        {/* metrics */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard loading={loading} icon="inbox" tone="info" label="Pending deliveries" value={pending} sub="Ready, awaiting assignment" trend={{ dir: "up", value: "+3" }} />
          <MetricCard loading={loading} icon="route" tone="primary" label="Active assignments" value={active} sub="In the field right now" />
          <MetricCard loading={loading} icon="alert" tone="warning" label="SLA risk" value={slaRisk} sub="At-risk or breached deadlines" trend={{ dir: "up", value: "+1" }} />
          <MetricCard loading={loading} icon="users" tone="success" label="Drivers available" value={`${availDrivers}/${DB.drivers.length}`} sub="Available to dispatch now" trend={{ dir: "down", value: "−2" }} />
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* needs attention */}
          <Card className="xl:col-span-2 overflow-hidden">
            <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>Needs attention</h2>
                <Chip tone="warning" size="sm">{attention.length}</Chip>
              </div>
              <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={() => navigate({ name: "deliveries" })}>View queue</Button>
            </div>
            {loading ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton w={64} h={14} /><Skeleton w="40%" h={12} /><div className="flex-1" /><Skeleton w={70} h={20} /><Skeleton w={56} h={20} />
                  </div>
                ))}
              </div>
            ) : (
              <ul>
                {attention.map((d, i) => {
                  const zone = DB.zoneById(d.zoneId);
                  const sla = deadlineState(d.deadlineAt);
                  return (
                    <li key={d.id}>
                      <button onClick={() => navigate({ name: "delivery", params: { id: d.id } })}
                        className="ring-focus w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-alt"
                        style={{ borderTop: i ? "1px solid var(--color-border)" : "none" }}>
                        <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 30, height: 30, background: sla === "breached" ? "var(--tint-danger)" : sla === "at-risk" ? "var(--tint-warning)" : "var(--tint-info)", color: sla === "breached" ? "var(--color-danger)" : sla === "at-risk" ? "var(--color-warning)" : "var(--color-info)" }}>
                          <Icon name={d.status === "ready" ? "inbox" : "clock"} size={15} />
                        </span>
                        <span className="min-w-0 flex flex-col">
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-[13px] tnum" style={{ color: "var(--color-text)" }}>{d.reference}</span>
                            <PriorityChip value={d.priority} size="sm" />
                          </span>
                          <span className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>{zone.name} · {d.pickupAddress} → {d.dropoffAddress}</span>
                        </span>
                        <span className="flex-1" />
                        <span className="hidden sm:flex items-center gap-1 text-[12px] tnum mr-1" style={{ color: sla === "breached" ? "var(--color-danger)" : "var(--color-text-muted)" }}>
                          <Icon name="clock" size={13} />{fromNow(d.deadlineAt)}
                        </span>
                        <StatusChip status={d.status} size="sm" />
                        <Icon name="chevronRight" size={16} style={{ color: "var(--color-text-muted)" }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* right column: driver availability + activity */}
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="px-4 h-12 flex items-center justify-between border-b" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>Driver availability</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate({ name: "drivers" })}>All</Button>
              </div>
              <div className="p-4 space-y-3">
                {loading ? [0,1,2].map((i)=>(<Skeleton key={i} h={14} />)) : (() => {
                  const groups = { available: 0, busy: 0, offline: 0 };
                  DB.drivers.forEach((d) => { groups[d.availability === "inactive" ? "offline" : d.availability]++; });
                  const total = DB.drivers.length;
                  const rows = [
                    { k: "available", tone: "success", label: "Available" },
                    { k: "busy", tone: "warning", label: "Busy" },
                    { k: "offline", tone: "neutral", label: "Offline" },
                  ];
                  return rows.map((r) => (
                    <div key={r.k} className="flex items-center gap-3">
                      <span className="rounded-full" style={{ width: 8, height: 8, background: window.UI.TONE[r.tone].fg }} />
                      <span className="text-[13px] flex-1" style={{ color: "var(--color-text)" }}>{r.label}</span>
                      <span className="flex-[2] block rounded-full overflow-hidden" style={{ height: 6, background: "var(--color-surface-alt)" }}>
                        <span className="block h-full rounded-full" style={{ width: `${(groups[r.k] / total) * 100}%`, background: window.UI.TONE[r.tone].fg }} />
                      </span>
                      <span className="tnum text-[12.5px] w-5 text-right font-medium" style={{ color: "var(--color-text)" }}>{groups[r.k]}</span>
                    </div>
                  ));
                })()}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-4 h-12 flex items-center border-b" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>Recent activity</h2>
              </div>
              <ul className="p-4 space-y-3.5">
                {loading ? [0,1,2,3].map((i)=>(<Skeleton key={i} h={12} />)) : [
                  { icon: "sparkles", tone: "primary", text: <>Recommendations run for <b>DLV-2041</b></>, time: "2m ago" },
                  { icon: "check", tone: "success", text: <>DLV-2029 marked <b>delivered</b></>, time: "12m ago" },
                  { icon: "route", tone: "info", text: <>Hana Kim assigned to <b>DLV-2040</b></>, time: "24m ago" },
                  { icon: "alert", tone: "danger", text: <>DLV-2035 <b>failed</b> — recipient unavailable</>, time: "1h ago" },
                ].map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex items-center justify-center rounded-full shrink-0 mt-0.5" style={{ width: 24, height: 24, background: window.UI.TONE[a.tone].bg, color: window.UI.TONE[a.tone].fg }}>
                      <Icon name={a.icon} size={13} />
                    </span>
                    <span className="min-w-0 flex flex-col">
                      <span className="text-[12.5px] leading-snug" style={{ color: "var(--color-text)" }}>{a.text}</span>
                      <span className="text-[11.5px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{a.time}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  window.DashboardScreen = DashboardScreen;
})();
