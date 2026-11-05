import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { AuthResult, Dashboard, Period } from '../api/types.ts';
import { AuthProvider } from '../auth/AuthContext.tsx';
import { SESSION_KEY } from '../auth/session.ts';
import { routes } from '../routes.tsx';

const base64url = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');

/** JWT con la forma de los que emite la API; la firma no se comprueba en el cliente. */
export function fakeToken(expiresInSeconds = 24 * 60 * 60): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: '1', email: 'ana@example.com', exp })}.firma`;
}

export const authResult = (): AuthResult => ({
  token: fakeToken(),
  user: { id: 1, email: 'ana@example.com', name: 'Ana', createdAt: '2026-11-05T10:00:00.000Z' },
});

/** Deja una sesión válida guardada, como si el usuario ya hubiera hecho login. Devuelve el token. */
export function storeSession(): string {
  const { token, user } = authResult();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user, expiresAt: Date.now() + 60 * 60 * 1000 }));
  return token;
}

export interface MockResponse {
  status: number;
  body?: unknown;
}

export interface MockRequest {
  body: unknown;
  headers: Record<string, string>;
}

type Route = MockResponse | ((req: MockRequest) => MockResponse);

/**
 * Sustituye fetch por una API falsa. Las claves son "MÉTODO /ruta" tal y como las pide
 * el cliente (con el prefijo /api y la query). Una ruta no declarada responde 404.
 */
export function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const route = routes[`${init.method ?? 'GET'} ${url}`];
    const req: MockRequest = {
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    const { status, body } =
      route === undefined
        ? { status: 404, body: { error: 'Not Found', message: `Sin mock para ${init.method} ${url}` } }
        : typeof route === 'function'
          ? route(req)
          : route;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const emptyDashboard = (days: Period = 30): Dashboard => ({
  period: { days, from: '2026-10-07', to: '2026-11-05', timezone: 'UTC' },
  totals: { urls: 0, clicks: 0, urlsWithClicks: 0, lastClickAt: null },
  trend: { clicks: 0, previousClicks: 0, changePct: null, uniqueVisitors: 0 },
  daily: [],
});

/** Lo que pide el dashboard al cargarse, para un usuario sin URLs. */
export const emptyDashboardApi = (): Record<string, Route> => ({
  'GET /api/urls/mine': { status: 200, body: [] },
  'GET /api/dashboard?days=30': { status: 200, body: emptyDashboard() },
});

/** Monta la aplicación completa en `path`, con los mismos providers que main.tsx. */
export function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}
