import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth.ts';
import { ApiError } from '../api/client.ts';
import type { AuthResult, LoginInput, RegisterInput } from '../api/types.ts';
import { clearSession, createSession, loadSession, saveSession, SESSION_KEY, type Session } from './session.ts';

export const EXPIRED_NOTICE = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

interface AuthContextValue {
  session: Session | undefined;
  /** Aviso para la página de login (p. ej. sesión caducada). */
  notice: string | undefined;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  /** Llama a la API con el token. Si responde 401, cierra la sesión y avisa. */
  withToken: <T>(call: (token: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// setTimeout no admite más de ~24,8 días; los tokens de la API duran 24 h, pero por si acaso.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | undefined>(() => loadSession());
  const [notice, setNotice] = useState<string>();

  const end = useCallback(
    (reason?: string) => {
      clearSession();
      setSession(undefined);
      setNotice(reason);
      // Que los datos de este usuario no se vean si entra otro en la misma pestaña.
      queryClient.clear();
    },
    [queryClient],
  );

  const logout = useCallback(() => end(), [end]);

  const start = useCallback(({ token, user }: AuthResult) => {
    const next = createSession(token, user);
    if (next === undefined) {
      // La API siempre firma con exp: si falta, el token no es el esperado.
      throw new ApiError(0, 'El servidor ha devuelto un token no válido.');
    }
    saveSession(next);
    setSession(next);
    setNotice(undefined);
  }, []);

  const login = useCallback(async (input: LoginInput) => start(await authApi.login(input)), [start]);
  const register = useCallback(async (input: RegisterInput) => start(await authApi.register(input)), [start]);

  const withToken = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      if (session === undefined) throw new ApiError(401, EXPIRED_NOTICE);
      try {
        return await call(session.token);
      } catch (err) {
        // Token caducado, revocado o de un usuario borrado: ya no sirve para nada.
        if (err instanceof ApiError && err.status === 401) end(EXPIRED_NOTICE);
        throw err;
      }
    },
    [session, end],
  );

  // Cierra la sesión cuando caduca el token, sin esperar a que la API devuelva 401.
  useEffect(() => {
    if (session === undefined) return undefined;
    const timer = setTimeout(
      () => end(EXPIRED_NOTICE),
      Math.min(Math.max(session.expiresAt - Date.now(), 0), MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [session, end]);

  // Login o logout en otra pestaña.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === SESSION_KEY || event.key === null) setSession(loadSession());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({ session, notice, login, register, logout, withToken }),
    [session, notice, login, register, logout, withToken],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth se usó fuera de <AuthProvider>');
  }
  return context;
}
