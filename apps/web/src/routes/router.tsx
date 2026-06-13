import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/shell/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnly } from './PublicOnly';
import { RouteStub } from './RouteStub';

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
            element: <RouteStub title="Dashboard" slice="Slice 3" />,
          },
          {
            path: 'deliveries',
            element: <RouteStub title="Deliveries" slice="Slice 2" />,
          },
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
