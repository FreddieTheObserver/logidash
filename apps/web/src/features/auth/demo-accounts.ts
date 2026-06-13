import type { IconName } from '../../components/ui/icons';

export interface DemoAccount {
  role: 'admin' | 'dispatcher' | 'driver' | 'viewer';
  name: string;
  email: string;
  icon: IconName;
}

export const DEMO_PASSWORD = 'Demo123!';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'admin', name: 'Admin', email: 'admin@logidash.dev', icon: 'shield' },
  {
    role: 'dispatcher',
    name: 'Dispatcher',
    email: 'dispatcher@logidash.dev',
    icon: 'route',
  },
  {
    role: 'driver',
    name: 'Alex (driver)',
    email: 'driver.alex@logidash.dev',
    icon: 'truck',
  },
  {
    role: 'viewer',
    name: 'Viewer',
    email: 'viewer@logidash.dev',
    icon: 'eye',
  },
];
