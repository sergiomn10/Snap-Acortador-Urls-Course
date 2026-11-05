import type { ApiErrorBody } from './types.ts';

// En desarrollo /api lo reenvía el proxy de Vite; en producción se fija con VITE_API_URL.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

/** Error de una petición a la API. `status` 0 indica que no hubo respuesta (red caída). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && typeof (value as ApiErrorBody).error === 'string';
}

// Si la API no está arrancada, el proxy de Vite responde 5xx sin cuerpo JSON.
function fallbackMessage(status: number): string {
  if (status >= 500) return 'El servidor no ha podido completar la petición. Inténtalo de nuevo en unos segundos.';
  return `La petición ha fallado (${status}).`;
}

interface RequestOptions {
  body?: unknown;
  token?: string;
}

export async function request<T>(method: string, path: string, { body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Comprueba tu conexión.');
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => undefined);
  if (res.ok) return data as T;

  const message = isApiErrorBody(data) && data.message ? data.message : fallbackMessage(res.status);
  throw new ApiError(res.status, message);
}
