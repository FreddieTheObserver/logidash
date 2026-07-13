import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/shell/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnly } from './PublicOnly';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DeliveriesPage } from '../features/deliveries/DeliveriesPage';
import { DeliveryDetailPage } from '../features/deliveries/DeliveryDetailPage';
import { DriversPage } from '../features/drivers/DriversPage';
import { DriverDetailPage } from '../features/drivers/DriverDetailPage';
import { AdminPage } from '../features/admin/AdminPage';

export const router = createBrowserRouter([
  { path: '/login', element: <PublicOnly /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <DashboardPage />,
          },
          { path: 'deliveries', element: <DeliveriesPage /> },
          { path: 'deliveries/:id', element: <DeliveryDetailPage /> },
          {
            element: (
              <ProtectedRoute
                allowedRoles={['admin', 'dispatcher', 'viewer']}
              />
            ),
            children: [
              {
                path: 'drivers',
                element: <DriversPage />,
              },
              {
                path: 'drivers/:id',
                element: <DriverDetailPage />,
              },
            ],
          },
          {
            element: <ProtectedRoute allowedRoles={['admin']} />,
            children: [
              {
                path: 'admin',
                element: <AdminPage />,
              },
            ],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
