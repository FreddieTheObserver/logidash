import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/shell/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnly } from './PublicOnly';
import { RouteStub } from './RouteStub';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DeliveriesPage } from '../features/deliveries/DeliveriesPage';
import { DeliveryDetailPage } from '../features/deliveries/DeliveryDetailPage';

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
                element: <RouteStub title="Drivers" slice="Slice 3" />,
              },
            ],
          },
          {
            element: <ProtectedRoute allowedRoles={['admin']} />,
            children: [
              {
                path: 'admin',
                element: <RouteStub title="Admin" slice="Slice 3" />,
              },
            ],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
