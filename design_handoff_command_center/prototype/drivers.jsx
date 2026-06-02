/* Drivers list + driver detail. Exposes window.DriversScreen, window.DriverDetailScreen. */
(function () {
  "use strict";
  const { useState, useEffect } = React;
  const Icon = window.Icon;
  const UI = window.UI;
  const { Card, Chip, AvailabilityChip, Button, Avatar, Skeleton, Meter, Input, Select, fromNow } = UI;
  const DB = window.DB;

  function DriversScreen({ navigate, role }) {
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [avail, setAvail] = useState("all");
    useEffect(() => { const t = setTimeout(() => setLoading(false), 650); return () => clearTimeout(t); }, []);

    const rows = DB.drivers.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (avail !== "all" && d.availability !== avail) return false;
      return true;
    });

    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers…"
              className="ring-focus w-full h-9 pl-9 pr-3 text-[13px] rounded-md border bg-surface outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
          </div>
          <div style={{ width: 180 }}>
            <Select value={avail} onChange={(e) => setAvail(e.target.value)}>
              <option value="all">All availability</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </Select>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: "var(--color-surface)" }}>
                  {["Driver","Availability","Base zone","Vehicle","Workload","Capacity used",""].map((h, i) => (
                    <th key={i} className="text-left font-semibold text-[11.5px] uppercase tracking-wide px-3 h-10 border-b whitespace-nowrap"
                      style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}>
                        {Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-3 h-[52px]"><Skeleton w={j === 0 ? "60%" : "50%"} h={j === 1 ? 18 : 12} /></td>)}
                      </tr>
                    ))
                  : rows.map((d, i) => {
                      const v = DB.vehicleById(d.vehicleId);
                      const zone = DB.zoneById(d.baseZoneId);
                      const cap = v.usedWeight / v.capacityWeight;
                      const load = d.activeJobCount / d.maxConcurrentJobs;
                      return (
                        <tr key={d.id} tabIndex={0} onClick={() => navigate({ name: "driver", params: { id: d.id } })}
                          onKeyDown={(e) => e.key === "Enter" && navigate({ name: "driver", params: { id: d.id } })}
                          className="ring-focus cursor-pointer transition-colors"
                          style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--tint-primary)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = i % 2 ? "var(--color-surface-alt)" : "transparent"}>
                          <td className="px-3 h-[52px]"><span className="flex items-center gap-2.5"><Avatar initials={d.initials} name={d.name} id={d.id} size={32} /><span className="flex flex-col"><span className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{d.name}</span><span className="text-[11.5px] tnum" style={{ color: "var(--color-text-muted)" }}>{d.phone}</span></span></span></td>
                          <td className="px-3"><AvailabilityChip value={d.availability} size="sm" /></td>
                          <td className="px-3"><span className="text-[12.5px]" style={{ color: "var(--color-text)" }}>{zone.name}</span></td>
                          <td className="px-3 whitespace-nowrap"><span className="text-[12.5px] capitalize" style={{ color: "var(--color-text-muted)" }}>{v.type} · {v.plate}</span></td>
                          <td className="px-3" style={{ minWidth: 130 }}><span className="flex items-center gap-2"><span className="flex-1"><Meter value={load} tone={load >= 1 ? "danger" : load > .6 ? "warning" : "success"} /></span><span className="tnum text-[12px] w-8" style={{ color: "var(--color-text-muted)" }}>{d.activeJobCount}/{d.maxConcurrentJobs}</span></span></td>
                          <td className="px-3" style={{ minWidth: 130 }}><span className="flex items-center gap-2"><span className="flex-1"><Meter value={cap} tone={cap > .85 ? "warning" : "primary"} /></span><span className="tnum text-[12px] w-9 text-right" style={{ color: "var(--color-text-muted)" }}>{Math.round(cap*100)}%</span></span></td>
                          <td className="px-3 text-right"><Icon name="chevronRight" size={16} style={{ color: "var(--color-text-muted)" }} /></td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  function StatBox({ label, value, sub, tone }) {
    return (
      <div className="rounded-md border p-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</div>
        <div className="tnum text-[20px] font-semibold mt-1" style={{ color: tone ? UI.TONE[tone].fg : "var(--color-text)" }}>{value}</div>
        {sub && <div className="text-[11.5px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{sub}</div>}
      </div>
    );
  }

  function DriverDetailScreen({ driverId, navigate, role }) {
    const d = DB.driverById(driverId) || DB.drivers[0];
    const v = DB.vehicleById(d.vehicleId);
    const zone = DB.zoneById(d.baseZoneId);
    const cap = v.usedWeight / v.capacityWeight;
    const history = DB.assignmentHistory[d.id] || [
      { reference: "DLV-2041", status: "active", at: new Date().toISOString(), note: "In progress" },
    ];
    const completed = history.filter((h) => h.status === "completed").length;

    return (
      <div className="p-6 max-w-[1100px] mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* profile */}
          <Card className="p-5">
            <div className="flex items-center gap-3.5">
              <Avatar initials={d.initials} name={d.name} id={d.id} size={56} />
              <div>
                <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>{d.name}</h1>
                <div className="mt-1"><AvailabilityChip value={d.availability} /></div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {[
                { icon: "phone", label: "Phone", val: d.phone },
                { icon: "map", label: "Base zone", val: `${zone.name} (${zone.code})` },
                { icon: "truck", label: "Vehicle", val: `${v.type} · ${v.plate}`, cap: true },
                { icon: "calendar", label: "Joined", val: d.joined },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <Icon name={r.icon} size={15} style={{ color: "var(--color-text-muted)" }} />
                  <span className="text-[12.5px] w-20 shrink-0" style={{ color: "var(--color-text-muted)" }}>{r.label}</span>
                  <span className="text-[13px] capitalize" style={{ color: "var(--color-text)" }}>{r.val}</span>
                </div>
              ))}
            </div>
            {(role === "admin" || role === "dispatcher") && (
              <div className="mt-5 flex gap-2">
                <Button variant="secondary" size="sm" icon="route" className="flex-1">Assign delivery</Button>
                <Button variant="ghost" size="sm" icon="moreH" aria-label="More" />
              </div>
            )}
          </Card>

          {/* stats + capacity */}
          <Card className="lg:col-span-2 p-5">
            <h2 className="text-[13.5px] font-semibold mb-3" style={{ color: "var(--color-text)" }}>Workload & capacity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Active jobs" value={`${d.activeJobCount}/${d.maxConcurrentJobs}`} sub="concurrent" tone={d.activeJobCount >= d.maxConcurrentJobs ? "danger" : "success"} />
              <StatBox label="Completed" value={completed} sub="lifetime (demo)" />
              <StatBox label="On-time rate" value="96%" sub="last 30 days" tone="success" />
              <StatBox label="Avg. score" value="78" sub="as recommended" tone="warning" />
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-[12.5px] mb-1.5"><span style={{ color: "var(--color-text-muted)" }}>Job slots in use</span><span className="tnum font-medium" style={{ color: "var(--color-text)" }}>{d.activeJobCount} of {d.maxConcurrentJobs}</span></div>
                <Meter value={d.activeJobCount / d.maxConcurrentJobs} tone={d.activeJobCount >= d.maxConcurrentJobs ? "danger" : "success"} height={8} />
              </div>
              <div>
                <div className="flex items-center justify-between text-[12.5px] mb-1.5"><span style={{ color: "var(--color-text-muted)" }}>Vehicle weight capacity</span><span className="tnum font-medium" style={{ color: "var(--color-text)" }}>{v.usedWeight} / {v.capacityWeight} kg</span></div>
                <Meter value={cap} tone={cap > .85 ? "warning" : "primary"} height={8} />
              </div>
            </div>
          </Card>
        </div>

        {/* assignment history */}
        <Card className="overflow-hidden">
          <div className="px-4 h-12 flex items-center gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
            <Icon name="activity" size={15} style={{ color: "var(--color-text-muted)" }} />
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>Assignment history</h2>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: "var(--color-surface)" }}>
                {["Reference","Status","When","Note"].map((h) => <th key={h} className="text-left font-semibold text-[11.5px] uppercase tracking-wide px-4 h-9 border-b" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="cursor-pointer transition-colors hover:bg-surface-alt" style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}
                  onClick={() => { const dl = DB.deliveries.find((x) => x.reference === h.reference); if (dl) navigate({ name: "delivery", params: { id: dl.id } }); }}>
                  <td className="px-4 h-11"><span className="tnum text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{h.reference}</span></td>
                  <td className="px-4"><Chip tone={h.status === "active" ? "info" : h.status === "completed" ? "success" : "neutral"} dot size="sm">{h.status[0].toUpperCase()+h.status.slice(1)}</Chip></td>
                  <td className="px-4"><span className="tnum text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{fromNow(h.at)}</span></td>
                  <td className="px-4"><span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{h.note}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  window.DriversScreen = DriversScreen;
  window.DriverDetailScreen = DriverDetailScreen;
})();
