import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthContext.tsx';
import { createQueryClient } from './query-client.ts';
import { routes } from './routes.tsx';
import './index.css';

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

const root = document.getElementById('root');
if (root === null) throw new Error('Falta el elemento #root en index.html');

// AuthProvider dentro de QueryClientProvider: al cerrar sesión vacía la caché.
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
