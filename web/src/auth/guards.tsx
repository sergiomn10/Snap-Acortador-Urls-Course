import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from './AuthContext.tsx';

export const HOME_PATH = '/dashboard';

/**
 * Destino tras autenticarse: el `next` de la URL si es una ruta interna, si no el inicio.
 * Se rechaza `//host` y similares para no redirigir fuera de la aplicación.
 */
export function safeNext(next: string | null): string {
  return next !== null && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : HOME_PATH;
}

/** Solo con sesión; si no, a /login recordando a dónde se quería ir. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (session === undefined) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/** Login y registro: con sesión no tienen sentido, se salta al destino. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [params] = useSearchParams();
  if (session !== undefined) {
    return <Navigate to={safeNext(params.get('next'))} replace />;
  }
  return children;
}
