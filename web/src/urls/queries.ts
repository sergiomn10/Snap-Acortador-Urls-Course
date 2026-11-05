import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDashboard } from '../api/dashboard.ts';
import type { CreateUrlInput, Period } from '../api/types.ts';
import { createUrl, listMyUrls } from '../api/urls.ts';
import { useAuth } from '../auth/AuthContext.tsx';

// El id del usuario va en la clave: la caché de una cuenta nunca sirve para otra.
const myUrlsKey = (userId: number | undefined) => ['urls', 'mine', userId] as const;
const dashboardKey = (userId: number | undefined, days: Period) => ['dashboard', userId, days] as const;

export function useMyUrls() {
  const { session, withToken } = useAuth();
  return useQuery({
    queryKey: myUrlsKey(session?.user.id),
    queryFn: () => withToken(listMyUrls),
    enabled: session !== undefined,
  });
}

export function useDashboard(days: Period) {
  const { session, withToken } = useAuth();
  return useQuery({
    queryKey: dashboardKey(session?.user.id, days),
    queryFn: () => withToken((token) => getDashboard(token, days)),
    enabled: session !== undefined,
    // Al cambiar de periodo se siguen viendo las cifras anteriores hasta que llegan las nuevas.
    placeholderData: keepPreviousData,
  });
}

export function useCreateUrl() {
  const { withToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUrlInput) => withToken((token) => createUrl(token, input)),
    // Una URL nueva cambia el listado y los totales del dashboard.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['urls', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  });
}
