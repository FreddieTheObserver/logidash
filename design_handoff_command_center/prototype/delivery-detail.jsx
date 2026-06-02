/* Delivery detail: two-column (info + route + status controls | audit timeline)
   with the RECOMMENDATION PANEL. Exposes window.DeliveryDetailScreen. */
(function () {
  "use strict";
  const { useState, useEffect } = React;
  const Icon = window.Icon;
  const UI = window.UI;
  const { Card, Chip, StatusChip, PriorityChip, SlaChip, ScoreChip, Button, Avatar, Skeleton, Meter, fromNow, deadlineState, scoreTone } = UI;
  const DB = window.DB;

  const FACTOR_META = {
    zoneFit:           { label: "Zone fit",           icon: "pin" },
    routeProximity:    { label: "Route proximity",    icon: "route" },
    remainingCapacity: { label: "Remaining capacity", icon: "scale" },
    workloadBalance:   { label: "Workload balance",   icon: "activity" },
    deadlineFit:       { label: "Deadline fit",       icon: "clock" },
    priorityFit:       { label: "Priority fit",       icon: "flag" },
  };

  /* ---- factor breakdown (expanded candidate body) ---- */
  function FactorBreakdown({ factors, score }) {
    return (
      <div className="px-4 pb-4 pt-1 animate-fade">
        <div className="rounded-md border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <div className="grid items-center gap-2 px-3 h-8 text-[11px] font-semibold uppercase tracking-wide"
            style={{ gridTemplateColumns: "150px 1fr 56px 60px", background: "var(--color-surface-alt)", color: "var(--color-text-muted)" }}>
            <span>Factor</span><span>Normalized value</span><span className="text-center">Weight</span><span className="text-right">Points</span>
          </div>
          {factors.map((f, i) => {
            const meta = FACTOR_META[f.factor];
            return (
              <div key={f.factor} className="px-3 py-2.5" style={{ borderTop: "1px solid var(--color-border)" }}>
                <div className="grid items-center gap-2" style={{ gridTemplateColumns: "150px 1fr 56px 60px" }}>
                  <span className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--color-text)" }}>
                    <Icon name={meta.icon} size={14} style={{ color: "var(--color-text-muted)" }} />{meta.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1"><Meter value={f.rawValue} tone={scoreTone(f.rawValue * 100)} /></span>
                    <span className="tnum text-[11.5px] w-8" style={{ color: "var(--color-text-muted)" }}>{f.rawValue.toFixed(2)}</span>
                  </span>
                  <span className="text-center tnum text-[12px]" style={{ color: "var(--color-text-muted)" }}>×{f.weight.toFixed(2)}</span>
                  <span className="text-right tnum text-[12.5px] font-semibold" style={{ color: "var(--color-text)" }}>+{f.weighted.toFixed(1)}</span>
                </div>
                <div className="text-[12px] mt-1.5 pl-[22px]" style={{ color: "var(--color-text-muted)" }}>{f.reason}</div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-3 h-9" style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface-alt)" }}>
            <span className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>Weighted total</span>
            <span className="tnum text-[14px] font-semibold" style={{ color: UI.TONE[scoreTone(score)].fg }}>{score} / 100</span>
          </div>
        </div>
      </div>
    );
  }

  /* ---- eligible candidate card ---- */
  function CandidateCard({ cand, expanded, onToggle, onAssign, canAssign, assignedHere }) {
    const driver = DB.driverById(cand.driverId);
    const vehicle = DB.vehicleById(driver.vehicleId);
    const zone = DB.zoneById(driver.baseZoneId);
    const top = cand.rank === 1;
    return (
      <div className="rounded-lg border transition-colors"
        style={{ borderColor: assignedHere ? "var(--color-success)" : top ? "var(--color-primary)" : "var(--color-border)",
                 background: "var(--color-surface)", boxShadow: top && !assignedHere ? "0 0 0 1px var(--color-primary)" : "none" }}>
        <div className="flex items-center gap-3 p-3">
          {/* rank */}
          <span className="flex items-center justify-center rounded-md shrink-0 font-semibold tnum text-[13px]"
            style={{ width: 26, height: 26, background: top ? "var(--color-primary)" : "var(--color-surface-alt)", color: top ? "#fff" : "var(--color-text-muted)" }}>
            {cand.rank}
          </span>
          <Avatar initials={driver.initials} name={driver.name} id={driver.id} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13.5px] truncate" style={{ color: "var(--color-text)" }}>{driver.name}</span>
              {top && <Chip tone="primary" size="sm"><Icon name="sparkles" size={11} />Top pick</Chip>}
              {assignedHere && <Chip tone="success" size="sm" dot>Assigned</Chip>}
            </div>
            <div className="flex items-center gap-2 text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              <span className="capitalize">{vehicle.type} · {vehicle.plate}</span>
              <span style={{ opacity: .5 }}>·</span>
              <span>{zone.code}</span>
              <span style={{ opacity: .5 }}>·</span>
              <span className="tnum">{driver.activeJobCount}/{driver.maxConcurrentJobs} jobs</span>
            </div>
          </div>
          {/* score */}
          <div className="text-center shrink-0">
            <ScoreChip score={cand.score} size="lg" />
            <div className="text-[10.5px] mt-0.5 uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>score</div>
          </div>
          {/* actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {canAssign && (assignedHere
              ? <Button variant="secondary" size="sm" icon="check" disabled>Assigned</Button>
              : <Button variant="primary" size="sm" onClick={() => onAssign(cand)}>Assign</Button>)}
            <button onClick={onToggle} aria-expanded={expanded} aria-label="Toggle breakdown"
              className="ring-focus flex items-center justify-center rounded-md border hover:bg-surface-alt transition-colors"
              style={{ width: 32, height: 32, borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
              <Icon name="chevronDown" size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
            </button>
          </div>
        </div>
        {/* compact factor strip when collapsed */}
        {!expanded && (
          <div className="flex items-center gap-3 px-3 pb-3 pl-[52px] flex-wrap">
            {cand.factors.map((f) => (
              <span key={f.factor} className="flex items-center gap-1.5" title={`${FACTOR_META[f.factor].label}: +${f.weighted.toFixed(1)}`}>
                <Icon name={FACTOR_META[f.factor].icon} size={12} style={{ color: "var(--color-text-muted)" }} />
                <span className="block rounded-full overflow-hidden" style={{ width: 36, height: 5, background: "var(--color-surface-alt)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${f.rawValue * 100}%`, background: UI.TONE[scoreTone(f.rawValue * 100)].fg }} />
                </span>
              </span>
            ))}
          </div>
        )}
        {expanded && <FactorBreakdown factors={cand.factors} score={cand.score} />}
      </div>
    );
  }

  /* ---- ineligible card ---- */
  function IneligibleCard({ cand }) {
    const driver = DB.driverById(cand.driverId);
    const vehicle = DB.vehicleById(driver.vehicleId);
    return (
      <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-alt)" }}>
        <div className="flex items-center gap-3">
          <Avatar initials={driver.initials} name={driver.name} id={driver.id} size={32} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[13px]" style={{ color: "var(--color-text)" }}>{driver.name}</div>
            <div className="text-[12px] capitalize" style={{ color: "var(--color-text-muted)" }}>{vehicle.type} · {vehicle.plate}</div>
          </div>
          <ScoreChip eligible={false} />
        </div>
        <ul className="mt-2.5 pl-1 space-y-1">
          {cand.ineligibleReasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              <Icon name="x" size={13} style={{ color: "var(--color-danger)", marginTop: 2 }} />{r}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* ---- weights legend ---- */
  function WeightsLegend() {
    return (
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap px-4 py-2.5 border-b" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-alt)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Weights</span>
        {Object.entries(DB.WEIGHTS).map(([k, w]) => (
          <span key={k} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            <Icon name={FACTOR_META[k].icon} size={13} />{FACTOR_META[k].label}<span className="tnum font-medium" style={{ color: "var(--color-text)" }}>{w.toFixed(2)}</span>
          </span>
        ))}
      </div>
    );
  }

  /* ---- info row ---- */
  function InfoRow({ icon, label, children }) {
    return (
      <div className="flex items-start gap-3 py-2.5" style={{ borderTop: "1px solid var(--color-border)" }}>
        <Icon name={icon} size={15} style={{ color: "var(--color-text-muted)", marginTop: 2 }} />
        <span className="text-[12.5px] w-28 shrink-0" style={{ color: "var(--color-text-muted)" }}>{label}</span>
        <span className="text-[13px] flex-1" style={{ color: "var(--color-text)" }}>{children}</span>
      </div>
    );
  }

  function DeliveryDetailScreen({ deliveryId, navigate, role, toast }) {
    const base = DB.deliveryById(deliveryId) || DB.deliveryById("dl1");
    const [delivery, setDelivery] = useState(base);
    const [assignedDriver, setAssignedDriver] = useState(base.driverId);
    const [expanded, setExpanded] = useState({ d2: true }); // top pick open by default
    const [recLoading, setRecLoading] = useState(true);
    const [showIneligible, setShowIneligible] = useState(true);
    const [audit, setAudit] = useState(DB.auditByDelivery[deliveryId] ? [...DB.auditByDelivery[deliveryId]].reverse() : [...DB.auditByDelivery.dl1].reverse());
    const [confirm, setConfirm] = useState(null);

    useEffect(() => { setRecLoading(true); const t = setTimeout(() => setRecLoading(false), 850); return () => clearTimeout(t); }, [deliveryId]);

    const canAct = role === "admin" || role === "dispatcher";
    const run = DB.recommendationRun;
    const usingRecs = delivery.id === "dl1"; // the seeded run targets DLV-2041
    const eligible = run.candidates.filter((c) => c.eligible);
    const ineligible = run.candidates.filter((c) => !c.eligible);
    const route = DB.routeEstimate;
    const zone = DB.zoneById(delivery.zoneId);

    function pushAudit(action, reason) {
      setAudit((a) => [{ action, actor: "Jordan Lee", role: "dispatcher", at: new Date().toISOString(), reason }, ...a]);
    }

    function doAssign(cand) {
      const driver = DB.driverById(cand.driverId);
      setAssignedDriver(cand.driverId);
      setDelivery((d) => ({ ...d, status: "assigned", driverId: cand.driverId }));
      pushAudit("assignment.created", `Assigned ${driver.name} (${DB.vehicleById(driver.vehicleId).plate}) · score ${cand.score}`);
      pushAudit("delivery.status", "ready → assigned");
      setConfirm(null);
      toast({ message: `${driver.name} assigned to ${delivery.reference}`, tone: "success", icon: "check" });
    }

    function transition(to) {
      const from = delivery.status;
      setDelivery((d) => ({ ...d, status: to }));
      pushAudit("delivery.status", `${from} → ${to}`);
      toast({ message: `${delivery.reference} → ${UI.DELIVERY_LABEL[to]}`, tone: to === "failed" || to === "cancelled" ? "danger" : "success", icon: to === "failed" || to === "cancelled" ? "alert" : "check" });
    }

    // status transition buttons (excluding assignment-driven 'assigned')
    const nexts = DB.transitions[delivery.status].filter((t) => t !== "assigned");

    return (
      <div className="p-6 max-w-[1280px] mx-auto">
        {/* status control bar */}
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center rounded-md" style={{ width: 38, height: 38, background: "var(--tint-primary)", color: "var(--color-primary)" }}>
                <Icon name="package" size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-semibold tnum tracking-tight" style={{ color: "var(--color-text)" }}>{delivery.reference}</h1>
                  <StatusChip status={delivery.status} />
                  <PriorityChip value={delivery.priority} />
                </div>
                <div className="text-[12.5px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{zone.name} · created {fromNow(delivery.createdAt)}</div>
              </div>
            </div>
            <div className="flex-1" />
            {/* SLA */}
            {!["delivered","cancelled","failed"].includes(delivery.status) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: "var(--color-surface-alt)" }}>
                <Icon name="clock" size={15} style={{ color: "var(--color-text-muted)" }} />
                <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>Deadline</span>
                <span className="tnum text-[13px] font-medium" style={{ color: deadlineState(delivery.deadlineAt) === "breached" ? "var(--color-danger)" : "var(--color-text)" }}>{fromNow(delivery.deadlineAt)}</span>
                <SlaChip iso={delivery.deadlineAt} size="sm" />
              </div>
            )}
            {/* transition controls */}
            {canAct && nexts.length > 0 && (
              <div className="flex items-center gap-2">
                {nexts.map((to) => {
                  const danger = to === "cancelled" || to === "failed";
                  const fwd = ["picked_up","in_transit","delivered","ready"].includes(to);
                  return (
                    <Button key={to} size="md" variant={danger ? "danger" : fwd ? "primary" : "secondary"}
                      icon={to === "delivered" ? "check" : to === "cancelled" ? "x" : to === "failed" ? "alert" : undefined}
                      onClick={() => transition(to)}>
                      {to === "ready" ? "Unassign" : "Mark " + UI.DELIVERY_LABEL[to]}
                    </Button>
                  );
                })}
              </div>
            )}
            {!canAct && <Chip tone="neutral"><Icon name="eye" size={12} />Read-only ({role})</Chip>}
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* left: info + recommendations */}
          <div className="xl:col-span-2 space-y-6">
            {/* delivery info + route */}
            <Card>
              <div className="px-4 h-11 flex items-center border-b" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[13.5px] font-semibold" style={{ color: "var(--color-text)" }}>Delivery details</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-x-8 px-4 py-1">
                <div>
                  <InfoRow icon="pin" label="Pickup">{delivery.pickupAddress}</InfoRow>
                  <InfoRow icon="flag" label="Dropoff">{delivery.dropoffAddress}</InfoRow>
                  <InfoRow icon="map" label="Zone">{zone.name} <span className="tnum" style={{ color: "var(--color-text-muted)" }}>({zone.code})</span></InfoRow>
                </div>
                <div>
                  <InfoRow icon="package" label="Package"><span className="capitalize">{delivery.packageSize} · {delivery.packageType}</span> · <span className="tnum">{delivery.packageWeight} kg</span></InfoRow>
                  <InfoRow icon="flag" label="Priority"><span className="capitalize">{delivery.priority}</span></InfoRow>
                  <InfoRow icon="clock" label="Deadline"><span className="tnum">{fromNow(delivery.deadlineAt)}</span></InfoRow>
                </div>
              </div>
              {/* route estimate */}
              <div className="m-4 mt-2 rounded-md border p-3 flex items-center gap-4" style={{ borderColor: "var(--color-border)" }}>
                <span className="flex items-center justify-center rounded-md" style={{ width: 32, height: 32, background: "var(--tint-info)", color: "var(--color-info)" }}><Icon name="route" size={17} /></span>
                <div className="flex items-center gap-6">
                  <div><div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Distance</div><div className="tnum text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>{(route.distanceMeters/1000).toFixed(1)} km</div></div>
                  <div><div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Est. duration</div><div className="tnum text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>{Math.round(route.durationSeconds/60)} min</div></div>
                </div>
                <div className="flex-1" />
                <Chip tone="success" size="sm" dot>ORS · cached</Chip>
              </div>
            </Card>

            {/* recommendation panel */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2">
                  <Icon name="sparkles" size={16} style={{ color: "var(--color-primary)" }} />
                  <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>Driver recommendations</h2>
                  {!recLoading && usingRecs && <Chip tone="neutral" size="sm">{eligible.length} eligible · {ineligible.length} not</Chip>}
                </div>
                {canAct && <Button variant="secondary" size="sm" icon="refresh" onClick={() => { setRecLoading(true); setTimeout(() => setRecLoading(false), 800); }}>Re-run</Button>}
              </div>

              {!usingRecs ? (
                <UI.EmptyState icon="sparkles" title="No recommendation run yet"
                  body={delivery.status === "ready" ? "Run the engine to rank eligible drivers 0–100 with a per-factor explanation." : "Recommendations are available once a delivery is in the ready state."}
                  action={canAct && delivery.status === "ready" ? <Button variant="primary" icon="sparkles" onClick={() => navigate({ name: "delivery", params: { id: "dl1" } })}>Open DLV-2041 demo run</Button> : null} />
              ) : recLoading ? (
                <div className="p-4 space-y-3">
                  {[0,1,2,3].map((i) => (
                    <div key={i} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: "var(--color-border)" }}>
                      <Skeleton w={26} h={26} /><Skeleton w={36} h={36} style={{ borderRadius: 9999 }} />
                      <div className="flex-1"><Skeleton w="40%" h={13} /><Skeleton w="60%" h={11} className="mt-2" /></div>
                      <Skeleton w={46} h={24} /><Skeleton w={64} h={32} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <WeightsLegend />
                  <div className="p-4 space-y-2.5">
                    {eligible.map((c) => (
                      <CandidateCard key={c.driverId} cand={c}
                        expanded={!!expanded[c.driverId]}
                        onToggle={() => setExpanded((e) => ({ ...e, [c.driverId]: !e[c.driverId] }))}
                        onAssign={(cand) => setConfirm(cand)}
                        canAssign={canAct && delivery.status === "ready"}
                        assignedHere={assignedDriver === c.driverId} />
                    ))}
                  </div>

                  {/* ineligible */}
                  <div className="px-4 pb-4">
                    <button onClick={() => setShowIneligible((s) => !s)} className="ring-focus flex items-center gap-2 text-[12.5px] font-medium mb-2.5" style={{ color: "var(--color-text-muted)" }}>
                      <Icon name="chevronDown" size={14} style={{ transform: showIneligible ? "none" : "rotate(-90deg)", transition: "transform .18s" }} />
                      Ineligible drivers ({ineligible.length}) — shown with reasons
                    </button>
                    {showIneligible && (
                      <div className="grid sm:grid-cols-2 gap-2.5 animate-fade">
                        {ineligible.map((c) => <IneligibleCard key={c.driverId} cand={c} />)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* right: audit timeline */}
          <div>
            <Card className="overflow-hidden xl:sticky xl:top-6">
              <div className="px-4 h-12 flex items-center gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                <Icon name="activity" size={15} style={{ color: "var(--color-text-muted)" }} />
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>Audit timeline</h2>
              </div>
              <ol className="p-4">
                {audit.map((e, i) => (
                  <li key={i} className="flex gap-3 relative pb-4 last:pb-0">
                    {i < audit.length - 1 && <span className="absolute left-[11px] top-6 bottom-0" style={{ width: 1, background: "var(--color-border)" }} />}
                    <span className="flex items-center justify-center rounded-full shrink-0 z-10" style={{ width: 23, height: 23, background: auditTone(e.action).bg, color: auditTone(e.action).fg }}>
                      <Icon name={auditIcon(e.action)} size={12} />
                    </span>
                    <div className="min-w-0 -mt-0.5">
                      <div className="text-[12.5px] font-medium" style={{ color: "var(--color-text)" }}>{auditLabel(e.action)}</div>
                      {e.reason && <div className="text-[12px] mt-0.5 leading-snug" style={{ color: "var(--color-text-muted)" }}>{e.reason}</div>}
                      <div className="flex items-center gap-1.5 text-[11.5px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                        <span className="font-medium">{e.actor}</span><span style={{ opacity: .5 }}>·</span><span>{e.role}</span><span style={{ opacity: .5 }}>·</span><span className="tnum">{fromNow(e.at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>

        {/* assign confirm modal */}
        {confirm && <AssignModal cand={confirm} delivery={delivery} onCancel={() => setConfirm(null)} onConfirm={() => doAssign(confirm)} />}
      </div>
    );
  }

  function AssignModal({ cand, delivery, onCancel, onConfirm }) {
    const driver = DB.driverById(cand.driverId);
    const vehicle = DB.vehicleById(driver.vehicleId);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade" style={{ background: "rgba(16,24,40,.4)" }} onClick={onCancel}>
        <div className="bg-surface rounded-lg border w-full max-w-md" style={{ borderColor: "var(--color-border)", boxShadow: "var(--shadow-pop)" }} onClick={(e) => e.stopPropagation()}>
          <div className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="flex items-center justify-center rounded-md" style={{ width: 34, height: 34, background: "var(--tint-primary)", color: "var(--color-primary)" }}><Icon name="route" size={18} /></span>
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>Confirm assignment</h3>
            </div>
            <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              Assign <b style={{ color: "var(--color-text)" }}>{driver.name}</b> ({vehicle.type} · {vehicle.plate}) to <b style={{ color: "var(--color-text)" }} className="tnum">{delivery.reference}</b>?
              Eligibility is re-validated at assignment time and the action is written to the audit log.
            </p>
            <div className="flex items-center gap-3 mt-4 p-3 rounded-md" style={{ background: "var(--color-surface-alt)" }}>
              <ScoreChip score={cand.score} size="lg" />
              <div className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>Recommendation score · rank #{cand.rank} of eligible drivers</div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={onConfirm}>Assign driver</Button>
          </div>
        </div>
      </div>
    );
  }

  /* audit visual maps */
  function auditTone(action) {
    if (action.includes("status")) return UI.TONE.info;
    if (action.includes("assignment")) return UI.TONE.primary;
    if (action.includes("recommend")) return { fg: "var(--color-primary)", bg: "var(--tint-primary)" };
    if (action.includes("created")) return UI.TONE.success;
    return UI.TONE.neutral;
  }
  function auditIcon(action) {
    if (action.includes("status")) return "arrowRight";
    if (action.includes("assignment")) return "route";
    if (action.includes("recommend")) return "sparkles";
    if (action.includes("created")) return "plus";
    if (action.includes("geocoded")) return "pin";
    return "activity";
  }
  function auditLabel(action) {
    const map = { "delivery.created": "Delivery created", "delivery.geocoded": "Addresses geocoded", "delivery.status": "Status changed", "recommendations.run": "Recommendations run", "assignment.created": "Driver assigned" };
    return map[action] || action;
  }

  window.DeliveryDetailScreen = DeliveryDetailScreen;
})();
