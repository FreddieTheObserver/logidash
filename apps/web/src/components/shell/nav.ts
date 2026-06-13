import type { Role } from '@logidash/api-client';
import type { IconName } from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: Role[];
}

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'dashboard',
    roles: ['admin', 'dispatcher', 'driver', 'viewer'],
  },
  {
    to: '/deliveries',
    label: 'Deliveries',
    icon: 'package',
    roles: ['admin', 'dispatcher', 'driver', 'viewer'],
  },
  {
    to: '/drivers',
    label: 'Drivers',
    icon: 'users',
    roles: ['admin', 'dispatcher', 'viewer'],
  },
  { to: '/admin', label: 'Admin', icon: 'settings', roles: ['admin'] },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  viewer: 'Viewer',
};
