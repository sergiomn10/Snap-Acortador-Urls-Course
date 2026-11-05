import { ApiError } from '../api/client.ts';

/** Texto para el usuario: el `message` de la API si lo hay, si no uno genérico. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
}
