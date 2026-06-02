/* Admin: users & roles, zones, vehicle types. Exposes window.AdminScreen. */
(function () {
  "use strict";
  const { useState } = React;
  const Icon = window.Icon;
  const UI = window.UI;
  const { Card, Chip, Button, Avatar, Menu, MenuItem } = UI;
  const DB = window.DB;

  const ROLE_TONE = { admin: "primary", dispatcher: "info", driver: "success", viewer: "neutral" };

  function Tabs({ tabs, active, onChange }) {
    return (
      <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--color-border)" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className="ring-focus relative flex items-center gap-2 px-3 h-10 text-[13px] font-medium transition-colors"
            style={{ color: active === t.id ? "var(--color-primary)" : "var(--color-text-muted)" }}>
            <Icon name={t.icon} size={15} />{t.label}
            <span className="tnum text-[11px] px-1.5 rounded-full" style={{ background: "var(--color-surface-alt)", color: "var(--color-text-muted)" }}>{t.count}</span>
            {active === t.id && <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--color-primary)" }} />}
          </button>
        ))}
      </div>
    );
  }

  function THead({ cols }) {
    return (
      <thead>
        <tr style={{ background: "var(--color-surface)" }}>
          {cols.map((c, i) => <th key={i} className="text-left font-semibold text-[11.5px] uppercase tracking-wide px-4 h-10 border-b whitespace-nowrap" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)", textAlign: c.right ? "right" : "left" }}>{c.label || c}</th>)}
        </tr>
      </thead>
    );
  }

  function UsersTable({ canEdit }) {
    return (
      <table className="w-full border-collapse" style={{ minWidth: 720 }}>
        <THead cols={["User","Email","Role","Status","Last active",""]} />
        <tbody>
          {DB.users.map((u, i) => (
            <tr key={u.id} className="transition-colors hover:bg-surface-alt" style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}>
              <td className="px-4 h-[52px]"><span className="flex items-center gap-2.5"><Avatar initials={u.name.split(" ").map(s=>s[0]).join("").slice(0,2)} name={u.name} id={u.email} size={30} /><span className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{u.name}</span></span></td>
              <td className="px-4"><span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{u.email}</span></td>
              <td className="px-4"><Chip tone={ROLE_TONE[u.role]} size="sm">{u.role[0].toUpperCase()+u.role.slice(1)}</Chip></td>
              <td className="px-4"><Chip tone={u.status === "active" ? "success" : "neutral"} dot size="sm">{u.status[0].toUpperCase()+u.status.slice(1)}</Chip></td>
              <td className="px-4"><span className="text-[12.5px] tnum" style={{ color: "var(--color-text-muted)" }}>{u.lastActive}</span></td>
              <td className="px-3 text-right">
                {canEdit && <Menu trigger={<button className="ring-focus flex items-center justify-center rounded-md hover:bg-surface transition-colors ml-auto" style={{ width: 28, height: 28, color: "var(--color-text-muted)" }} aria-label="User actions"><Icon name="moreH" size={16} /></button>}>
                  <MenuItem icon="user">Edit profile</MenuItem>
                  <MenuItem icon="shield">Change role</MenuItem>
                  <MenuItem icon={u.status === "active" ? "x" : "check"} danger={u.status === "active"}>{u.status === "active" ? "Disable account" : "Re-enable"}</MenuItem>
                </Menu>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function ZonesTable() {
    const counts = {};
    DB.deliveries.forEach((d) => { counts[d.zoneId] = (counts[d.zoneId] || 0) + 1; });
    const drv = {};
    DB.drivers.forEach((d) => { drv[d.baseZoneId] = (drv[d.baseZoneId] || 0) + 1; });
    return (
      <table className="w-full border-collapse" style={{ minWidth: 640 }}>
        <THead cols={["Zone","Code",{label:"Center (lat, lng)"},{label:"Deliveries",right:true},{label:"Based drivers",right:true},""]} />
        <tbody>
          {DB.zones.map((z, i) => (
            <tr key={z.id} className="transition-colors hover:bg-surface-alt" style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}>
              <td className="px-4 h-[52px]"><span className="flex items-center gap-2.5"><span className="flex items-center justify-center rounded-md" style={{ width: 28, height: 28, background: "var(--tint-info)", color: "var(--color-info)" }}><Icon name="map" size={15} /></span><span className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{z.name}</span></span></td>
              <td className="px-4"><Chip tone="neutral" size="sm">{z.code}</Chip></td>
              <td className="px-4"><span className="tnum text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{z.lat.toFixed(3)}, {z.lng.toFixed(3)}</span></td>
              <td className="px-4 text-right"><span className="tnum text-[13px]" style={{ color: "var(--color-text)" }}>{counts[z.id] || 0}</span></td>
              <td className="px-4 text-right"><span className="tnum text-[13px]" style={{ color: "var(--color-text)" }}>{drv[z.id] || 0}</span></td>
              <td className="px-3 text-right"><Menu trigger={<button className="ring-focus flex items-center justify-center rounded-md hover:bg-surface transition-colors ml-auto" style={{ width: 28, height: 28, color: "var(--color-text-muted)" }} aria-label="Zone actions"><Icon name="moreH" size={16} /></button>}><MenuItem icon="settings">Edit zone</MenuItem><MenuItem icon="x" danger>Delete</MenuItem></Menu></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function VehicleTypesTable() {
    const counts = {};
    DB.vehicles.forEach((v) => { counts[v.type] = (counts[v.type] || 0) + 1; });
    return (
      <table className="w-full border-collapse" style={{ minWidth: 680 }}>
        <THead cols={["Type",{label:"Weight cap.",right:true},{label:"Volume cap.",right:true},"Use case",{label:"In fleet",right:true},""]} />
        <tbody>
          {DB.vehicleTypes.map((vt, i) => (
            <tr key={vt.type} className="transition-colors hover:bg-surface-alt" style={{ background: i % 2 ? "var(--color-surface-alt)" : "transparent" }}>
              <td className="px-4 h-[52px]"><span className="flex items-center gap-2.5"><span className="flex items-center justify-center rounded-md" style={{ width: 28, height: 28, background: "var(--color-surface-alt)", color: "var(--color-text-muted)" }}><Icon name={vt.type === "bike" ? "activity" : "truck"} size={15} /></span><span className="text-[13px] font-medium capitalize" style={{ color: "var(--color-text)" }}>{vt.label}</span></span></td>
              <td className="px-4 text-right"><span className="tnum text-[12.5px]" style={{ color: "var(--color-text)" }}>{vt.capacityWeight} kg</span></td>
              <td className="px-4 text-right"><span className="tnum text-[12.5px]" style={{ color: "var(--color-text)" }}>{vt.capacityVolume} L</span></td>
              <td className="px-4"><span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{vt.note}</span></td>
              <td className="px-4 text-right"><span className="tnum text-[13px]" style={{ color: "var(--color-text)" }}>{counts[vt.type] || 0}</span></td>
              <td className="px-3 text-right"><Menu trigger={<button className="ring-focus flex items-center justify-center rounded-md hover:bg-surface transition-colors ml-auto" style={{ width: 28, height: 28, color: "var(--color-text-muted)" }} aria-label="Vehicle type actions"><Icon name="moreH" size={16} /></button>}><MenuItem icon="settings">Edit capacities</MenuItem></Menu></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function AdminScreen({ role }) {
    const [tab, setTab] = useState("users");
    const canEdit = role === "admin";
    const tabs = [
      { id: "users", label: "Users & roles", icon: "users", count: DB.users.length },
      { id: "zones", label: "Zones", icon: "map", count: DB.zones.length },
      { id: "vehicles", label: "Vehicle types", icon: "truck", count: DB.vehicleTypes.length },
    ];
    const addLabel = { users: "Invite user", zones: "New zone", vehicles: "New type" }[tab];

    return (
      <div className="p-6 max-w-[1100px] mx-auto space-y-4">
        {!canEdit && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md border" style={{ borderColor: "var(--color-border)", background: "var(--tint-warning)" }}>
            <Icon name="shield" size={16} style={{ color: "var(--color-warning)" }} />
            <span className="text-[12.5px]" style={{ color: "var(--color-text)" }}>You're viewing Admin as <b className="capitalize">{role}</b> — configuration actions are restricted to admins.</span>
          </div>
        )}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-1">
            <Tabs tabs={tabs} active={tab} onChange={setTab} />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
              {tab === "users" && "Manage team members and their role-based access."}
              {tab === "zones" && "Operational zones used for zone-fit scoring and routing."}
              {tab === "vehicles" && "Vehicle classes and their capacity limits used in eligibility."}
            </span>
            {canEdit && <Button variant="primary" size="sm" icon="plus">{addLabel}</Button>}
          </div>
          <div className="overflow-x-auto scroll-thin border-t" style={{ borderColor: "var(--color-border)" }}>
            {tab === "users" && <UsersTable canEdit={canEdit} />}
            {tab === "zones" && <ZonesTable />}
            {tab === "vehicles" && <VehicleTypesTable />}
          </div>
        </Card>
      </div>
    );
  }

  window.AdminScreen = AdminScreen;
})();
