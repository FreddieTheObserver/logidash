import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/auth/auth-context';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { NAV } from './nav';

function titleForPath(pathname: string): string {
  const match = NAV.find((n) =>
    n.to === '/' ? pathname === '/' : pathname.startsWith(n.to),
  );
  return match?.label ?? 'logidash';
}

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();

  // ProtectedRoute guarantees an authenticated user before this renders;
  // this is a defensive guard for the type narrowing.
  if (!user) return null;

  return (
    <div className="flex h-screen">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={titleForPath(location.pathname)} user={user} />
        <main className="scroll-thin flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
