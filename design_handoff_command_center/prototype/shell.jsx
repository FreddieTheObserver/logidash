/* App shell: role-aware sidebar + top bar. Exposes window.Shell. */
(function () {
  "use strict";
  const { useState } = React;
  const Icon = window.Icon;
  const { Avatar, Menu, MenuItem, Chip } = window.UI;

  // Role-aware navigation. `roles` lists who sees the item.
  const NAV = [
    { id: "dashboard",  label: "Dashboard",  icon: "dashboard", roles: ["admin", "dispatcher", "driver", "viewer"] },
    { id: "deliveries", label: "Deliveries", icon: "package",   roles: ["admin", "dispatcher", "driver", "viewer"] },
    { id: "drivers",    label: "Drivers",    icon: "users",     roles: ["admin", "dispatcher", "viewer"] },
    { id: "admin",      label: "Admin",      icon: "settings",  roles: ["admin"] },
  ];

  const ROLE_LABEL = { admin: "Admin", dispatcher: "Dispatcher", driver: "Driver", viewer: "Viewer" };

  function NavItem({ item, active, onClick, count }) {
    return (
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className="ring-focus w-full flex items-center gap-3 h-9 px-3 rounded-md text-[13.5px] font-medium transition-colors relative"
        style={{
          color: active ? "var(--color-primary)" : "var(--color-text-muted)",
          background: active ? "var(--tint-primary)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-surface-alt)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        <Icon name={item.icon} size={18} strokeWidth={active ? 2 : 1.75} />
        <span className="flex-1 text-left">{item.label}</span>
        {count != null && (
          <span className="tnum text-[11.5px] font-semibold px-1.5 rounded-full"
            style={{ background: active ? "rgba(37,99,235,.15)" : "var(--color-surface-alt)", color: active ? "var(--color-primary)" : "var(--color-text-muted)", minWidth: 20, textAlign: "center" }}>
            {count}
          </span>
        )}
      </button>
    );
  }

  function Sidebar({ route, navigate, role, counts }) {
    const items = NAV.filter((n) => n.roles.includes(role));
    return (
      <aside className="shrink-0 flex flex-col border-r bg-surface" style={{ width: 232, borderColor: "var(--color-border)" }}>
        {/* brand */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <span className="flex items-center justify-center rounded-md" style={{ width: 28, height: 28, background: "var(--color-primary)" }}>
            <Icon name="route" size={17} className="text-white" strokeWidth={2} />
          </span>
          <span className="font-semibold text-[15px] tracking-tight" style={{ color: "var(--color-text)" }}>logidash</span>
        </div>

        {/* nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scroll-thin" aria-label="Primary">
          <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Operations</div>
          {items.map((item) => (
            <NavItem key={item.id} item={item}
              active={route.name === item.id}
              count={item.id === "deliveries" ? counts.openDeliveries : item.id === "drivers" ? counts.availableDrivers : null}
              onClick={() => navigate({ name: item.id })} />
          ))}
        </nav>

        {/* footer help */}
        <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div className="rounded-md p-3" style={{ background: "var(--color-surface-alt)" }}>
            <div className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--color-text)" }}>
              <Icon name="sparkles" size={14} style={{ color: "var(--color-primary)" }} />Recommendation engine
            </div>
            <div className="text-[11.5px] mt-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
              Drivers ranked 0–100 with a per-factor explanation on every delivery.
            </div>
          </div>
        </div>
      </aside>
    );
  }

  function TopBar({ title, subtitle, role, setRole, user, breadcrumb, onBack }) {
    return (
      <header className="h-14 shrink-0 flex items-center gap-4 px-6 border-b bg-surface" style={{ borderColor: "var(--color-border)" }}>
        <div className="min-w-0 flex-1">
          {breadcrumb && (
            <button onClick={onBack} className="ring-focus flex items-center gap-1 text-[12px] mb-0.5 hover:underline" style={{ color: "var(--color-text-muted)" }}>
              <Icon name="chevronLeft" size={13} />{breadcrumb}
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <h1 className="text-[16px] font-semibold tracking-tight truncate" style={{ color: "var(--color-text)" }}>{title}</h1>
            {subtitle && <span className="text-[12.5px] truncate" style={{ color: "var(--color-text-muted)" }}>{subtitle}</span>}
          </div>
        </div>

        {/* env badge */}
        <Chip tone="warning" size="sm">
          <Icon name="layers" size={12} /> Staging
        </Chip>

        {/* role switcher (demo affordance) */}
        <Menu trigger={
          <button className="ring-focus flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12.5px] font-medium hover:bg-surface-alt transition-colors whitespace-nowrap"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            <Icon name="shield" size={14} /> Viewing as: <span style={{ color: "var(--color-text)" }}>{ROLE_LABEL[role]}</span>
            <Icon name="chevronDown" size={13} />
          </button>
        }>
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Switch role</div>
          {["admin", "dispatcher", "driver", "viewer"].map((r) => (
            <MenuItem key={r} icon={role === r ? "check" : undefined} onClick={() => setRole(r)}>
              <span style={{ marginLeft: role === r ? 0 : 23, color: role === r ? "var(--color-primary)" : undefined }}>{ROLE_LABEL[r]}</span>
            </MenuItem>
          ))}
        </Menu>

        {/* notifications */}
        <button className="ring-focus relative flex items-center justify-center rounded-md hover:bg-surface-alt transition-colors" style={{ width: 34, height: 34, color: "var(--color-text-muted)" }} aria-label="Notifications">
          <Icon name="bell" size={18} />
          <span className="absolute rounded-full" style={{ top: 7, right: 8, width: 7, height: 7, background: "var(--color-danger)", border: "1.5px solid var(--color-surface)" }} />
        </button>

        {/* user menu */}
        <Menu trigger={
          <button className="ring-focus flex items-center gap-2 pl-1 pr-1.5 h-9 rounded-full hover:bg-surface-alt transition-colors" aria-label="User menu">
            <Avatar initials={user.initials} name={user.name} id={user.email} size={30} />
            <Icon name="chevronDown" size={14} style={{ color: "var(--color-text-muted)" }} />
          </button>
        }>
          <div className="px-3 py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>{user.name}</div>
            <div className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{user.email}</div>
          </div>
          <MenuItem icon="user">Profile</MenuItem>
          <MenuItem icon="settings">Preferences</MenuItem>
          <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />
          <MenuItem icon="logout" danger onClick={() => window.__logidashLogout && window.__logidashLogout()}>Sign out</MenuItem>
        </Menu>
      </header>
    );
  }

  window.Shell = { Sidebar, TopBar, NAV, ROLE_LABEL };
})();
