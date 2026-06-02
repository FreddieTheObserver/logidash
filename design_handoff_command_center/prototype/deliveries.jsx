/* Deliveries queue: filters, dense table, pagination, row actions,
   loading (skeleton) / empty / error states. Exposes window.DeliveriesScreen. */
(function () {
  "use strict";
  const { useState, useEffect, useMemo } = React;
  const Icon = window.Icon;
  const { Card, Chip, StatusChip, PriorityChip, SlaChip, Button, Skeleton, EmptyState, ErrorState, Input, Select, Menu, MenuItem, Avatar, fromNow, deadlineState } = window.UI;
  const DB = window.DB;

  const PAGE_SIZE = 8;

  function FilterSelect({ label, value, onChange, options }) {
    return (
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="ring-focus h-8 pl-2.5 pr-7 text-[12.5px] rounded-md border bg-surface outline-none appearance-none cursor-pointer font-medium"
          style={{ borderColor: value !== "all" ? "var(--color-primary)" : "var(--color-border)", color: value !== "all" ? "var(--color-primary)" : "var(--color-text-muted)" }}>
          <option value="all">{label}: All</option>
          {options.map((o) => <option key={o.value} value={o.value}>{label}: {o.label}</option>)}
        </select>
        <Icon name="chevronDown" size={13} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "currentColor", opacity: .6 }} />
      </div>
    );
  }

  function DeliveriesScreen({ navigate, role, view }) {
    // view: 'data' | 'loading' | 'empty' | 'error' (preview affordance)
    const [demoState, setDemoState] = useState("data");
    const [booting, setBooting] = useState(true);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const [priority, setPriority] = useState("all");
    const [zone, setZone] = useState("all");
    const [assign, setAssign] = useState("all");
    const [sla, setSla] = useState("all");
    const [page, setPage] = useState(0);

    useEffect(() => { const t = setTimeout(() => setBooting(false), 750); return () => clearTimeout(t); }, []);
    useEffect(() => { setPage(0); }, [q, status, priority, zone, assign, sla]);

    const filtered = useMemo(() => {
      return DB.deliveries.filter((d) => {
        if (q && !(`${d.reference} ${d.pickupAddress} ${d.dropoffAddress} ${d.packageType}`.toLowerCase().includes(q.toLowerCase()))) return false;
        if (status !== "all" && d.status !== status) return false;
        if (priority !== "all" && d.priority !== priority) return false;
        if (zone !== "all" && d.zoneId !== zone) return false;
        if (assign === "assigned" && !d.driverId) return false;
        if (assign === "unassigned" && d.driverId) return false;
        if (sla !== "all" && deadlineState(d.deadlineAt) !== sla) return false;
        return true;
      });
    }, [q, status, priority, zone, assign, sla]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const activeFilters = [status, priority, zone, assign, sla].filter((v) => v !== "all").length;
    const canAct = role === "admin" || role === "dispatcher";

    const effState = demoState !== "data" ? demoState : booting ? "loading" : filtered.length === 0 ? "empty" : "data";

    function clearFilters() { setStatus("all"); setPriority("all"); setZone("all"); setAssign("all"); setSla("all"); setQ(""); }

    return (
      <div className="p-6 max-w-[1280px] mx-auto space-y-4">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, address, package…"
              className="ring-focus w-full h-9 pl-9 pr-3 text-[13px] rounded-md border bg-surface outline-none"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
          </div>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={Object.keys(DB.transitions).map((s) => ({ value: s, label: window.UI.DELIVERY_LABEL[s] }))} />
          <FilterSelect label="Priority" value={priority} onChange={setPriority} options={["low","normal","high","urgent"].map((p) => ({ value: p, label: p[0].toUpperCase()+p.slice(1) }))} />
          <FilterSelect label="Zone" value={zone} onChange={setZone} options={DB.zones.map((z) => ({ value: z.id, label: z.code }))} />
          <FilterSelect label="SLA" value={sla} onChange={setSla} options={[{value:"on-track",label:"On track"},{value:"at-risk",label:"At risk"},{value:"breached",label:"Breached"}]} />
          <FilterSelect label="Assignment" value={assign} onChange={setAssign} options={[{value:"assigned",label:"Assigned"},{value:"unassigned",label:"Unassigned"}]} />
          {activeFilters > 0 && <Button variant="ghost" size="sm" icon="x" onClick={clearFilters}>Clear ({activeFilters})</Button>}
          <div className="flex-1" />
          {canAct && <Button variant="primary" size="md" icon="plus">New delivery</Button>}
        </div>

        {/* preview-state segmented control (design affordance) */}
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-medium" style={{ color: "var(--color-text-muted)" }}>Preview state:</span>
          <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            {["data","loading","empty","error"].map((s) => (
              <button key={s} onClick={() => setDemoState(s)}
                className="ring-focus px-2.5 h-7 text-[11.5px] font-medium capitalize transition-colors border-r last:border-r-0"
                style={{ borderColor: "var(--color-border)", background: demoState === s ? "var(--tint-primary)" : "var(--color-surface)", color: demoState === s ? "var(--color-primary)" : "var(--color-text-muted)" }}>{s}</button>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden">
          {effState === "error" ? (
            <ErrorState body="The deliveries service returned a 503. Your filters are preserved." onRetry={() => setDemoState("data")} />
          ) : effState === "empty" ? (
            <EmptyState icon="inbox" title="No deliveries match these filters"
              body="Try widening the status or zone filters, or clear them to see the full queue."
              action={<Button variant="secondary" icon="x" onClick={() => { clearFilters(); setDemoState("data"); }}>Clear filters</Button>} />
          ) : (
            <>
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full border-collapse" style={{ minWidth: 920 }}>
                  <thead>
                    <tr className="sticky top-0 z-10" style={{ background: "var(--color-surface)" }}>
                      {["Reference","Status","Priority","Zone","Route","Package","SLA","Deadline","Driver"].map((h, i) => (
                        <th key={h} className="text-left font-semibold text-[11.5px] uppercase tracking-wide px-3 h-10 whitespace-nowrap border-b"
                          style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)", textAlign: (h === "Deadline") ? "right" : "left" }}>{h}</th>
                      ))}
                      <th className="border-b" style={{ borderColor: "var(--color-border)", width: 44 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {effState === "loading"
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}>
                            {Array.from({ length: 9 }).map((__, j) => (
                              <td key={j} className="px-3 h-[46px]"><Skeleton w={j === 4 ? "80%" : j === 0 ? 66 : 60} h={j === 1 || j === 6 ? 18 : 12} /></td>
                            ))}
                            <td />
                          </tr>
                        ))
                      : pageRows.map((d, i) => {
                          const zoneObj = DB.zoneById(d.zoneId);
                          const driver = d.driverId ? DB.driverById(d.driverId) : null;
                          return (
                            <tr key={d.id} tabIndex={0}
                              onClick={() => navigate({ name: "delivery", params: { id: d.id } })}
                              onKeyDown={(e) => { if (e.key === "Enter") navigate({ name: "delivery", params: { id: d.id } }); }}
                              className="ring-focus cursor-pointer transition-colors group"
                              style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "var(--tint-primary)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = i % 2 ? "var(--color-surface-alt)" : "transparent"}>
                              <td className="px-3 h-[46px] whitespace-nowrap"><span className="font-medium text-[13px] tnum" style={{ color: "var(--color-text)" }}>{d.reference}</span></td>
                              <td className="px-3"><StatusChip status={d.status} size="sm" /></td>
                              <td className="px-3"><PriorityChip value={d.priority} size="sm" /></td>
                              <td className="px-3 whitespace-nowrap"><span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{zoneObj.code}</span></td>
                              <td className="px-3 max-w-[200px]"><span className="block text-[12.5px] truncate" style={{ color: "var(--color-text)" }}>{d.pickupAddress} <span style={{ color: "var(--color-text-muted)" }}>→</span> {d.dropoffAddress}</span></td>
                              <td className="px-3 whitespace-nowrap"><span className="text-[12.5px] capitalize" style={{ color: "var(--color-text-muted)" }}>{d.packageSize} · <span className="tnum">{d.packageWeight}kg</span></span></td>
                              <td className="px-3">{["delivered","cancelled","failed"].includes(d.status) ? <span className="text-[12px]" style={{color:"var(--color-text-muted)"}}>—</span> : <SlaChip iso={d.deadlineAt} size="sm" />}</td>
                              <td className="px-3 text-right whitespace-nowrap"><span className="tnum text-[12.5px]" style={{ color: deadlineState(d.deadlineAt) === "breached" && !["delivered","cancelled"].includes(d.status) ? "var(--color-danger)" : "var(--color-text-muted)" }}>{fromNow(d.deadlineAt)}</span></td>
                              <td className="px-3 whitespace-nowrap">
                                {driver
                                  ? <span className="flex items-center gap-1.5"><Avatar initials={driver.initials} name={driver.name} id={driver.id} size={22} /><span className="text-[12.5px]" style={{ color: "var(--color-text)" }}>{driver.name.split(" ")[0]}</span></span>
                                  : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>Unassigned</span>}
                              </td>
                              <td className="px-2" onClick={(e) => e.stopPropagation()}>
                                <Menu trigger={<button className="ring-focus flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-surface transition-opacity" style={{ width: 28, height: 28, color: "var(--color-text-muted)" }} aria-label="Row actions"><Icon name="moreH" size={16} /></button>}>
                                  <MenuItem icon="eye" onClick={() => navigate({ name: "delivery", params: { id: d.id } })}>Open detail</MenuItem>
                                  {canAct && d.status === "ready" && <MenuItem icon="sparkles" onClick={() => navigate({ name: "delivery", params: { id: d.id } })}>Recommend drivers</MenuItem>}
                                  {canAct && <MenuItem icon="route">Reassign</MenuItem>}
                                  <MenuItem icon="download">Export</MenuItem>
                                  {canAct && <MenuItem icon="x" danger disabled={["delivered","cancelled","failed"].includes(d.status)}>Cancel</MenuItem>}
                                </Menu>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div className="flex items-center justify-between px-4 h-12 border-t" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-[12.5px] tnum" style={{ color: "var(--color-text-muted)" }}>
                  {effState === "loading" ? "Loading…" : <>Showing <b style={{ color: "var(--color-text)" }}>{filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}</b> of {filtered.length}</>}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" size="sm" icon="chevronLeft" disabled={page === 0 || effState === "loading"} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
                  <span className="text-[12.5px] tnum px-2" style={{ color: "var(--color-text-muted)" }}>{page + 1} / {totalPages}</span>
                  <Button variant="secondary" size="sm" iconRight="chevronRight" disabled={page >= totalPages - 1 || effState === "loading"} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    );
  }

  window.DeliveriesScreen = DeliveriesScreen;
})();
