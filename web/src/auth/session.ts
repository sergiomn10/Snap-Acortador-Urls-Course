import type { PublicUser } from '../api/types.ts';
import { tokenExpiresAt } from './jwt.ts';

export interface Session {
  token: string;
  user: PublicUser;
  /** Instante de caducidad del token, en ms. */
  expiresAt: number;
}

export const SESSION_KEY = 'snap.session';

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const { token, user, expiresAt } = value as Partial<Session>;
  return typeof token === 'string' && typeof expiresAt === 'number' && typeof user?.id === 'number';
}

/** Crea la sesión a partir de la respuesta de login/registro. */
export function createSession(token: string, user: PublicUser): Session | undefined {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt === undefined ? undefined : { token, user, expiresAt };
}

// localStorage puede no existir o lanzar (modo privado, almacenamiento bloqueado):
// en ese caso la sesión dura lo que la pestaña.

/** Sesión guardada, o undefined si no hay, está corrupta o ya ha caducado. */
export function loadSession(now = Date.now()): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) && parsed.expiresAt > now ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Sin persistencia: la sesión sigue viva en memoria.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada que limpiar.
  }
}
