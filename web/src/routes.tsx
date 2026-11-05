import { Navigate, type RouteObject } from 'react-router';
import { HOME_PATH, PublicOnly, RequireAuth } from './auth/guards.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';

// Exportadas aparte para que los tests las monten con createMemoryRouter.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to={HOME_PATH} replace /> },
  {
    path: '/login',
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicOnly>
        <RegisterPage />
      </PublicOnly>
    ),
  },
  {
    path: HOME_PATH,
    element: (
      <RequireAuth>
        <DashboardPage />
      </RequireAuth>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];
