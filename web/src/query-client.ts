import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client.ts';

/** Reintenta solo errores que pueden ser pasajeros (red o 5xx), nunca los 4xx. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
