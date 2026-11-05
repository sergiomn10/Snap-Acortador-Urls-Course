// Copia de los tipos que devuelve la API (auth.service.ts, urls.repository.ts y
// dashboard.service.ts del backend). Si cambian allí, hay que actualizarlos aquí.

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Respuesta de POST /urls. */
export interface ShortUrl {
  code: string;
  url: string;
  createdAt: string;
  userId: number | null;
  shortUrl: string;
}

/** Elemento de GET /urls/mine. */
export interface MyUrl extends ShortUrl {
  clickCount: number;
  lastClickAt: string | null;
}

export interface CreateUrlInput {
  url: string;
  alias?: string;
}

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

/** Respuesta de GET /dashboard. */
export interface Dashboard {
  period: { days: Period; from: string; to: string; timezone: 'UTC' };
  totals: { urls: number; clicks: number; urlsWithClicks: number; lastClickAt: string | null };
  trend: { clicks: number; previousClicks: number; changePct: number | null; uniqueVisitors: number };
  daily: Array<{ date: string; clicks: number; uniqueVisitors: number }>;
}

/** Forma de todos los errores de la API. `message` falta en los 500 de producción. */
export interface ApiErrorBody {
  error: string;
  message?: string;
}
