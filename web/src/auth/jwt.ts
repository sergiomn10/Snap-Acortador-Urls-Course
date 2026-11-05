/**
 * Instante de caducidad (ms) de un JWT, leído de su claim `exp`.
 * Solo decodifica: la firma la verifica la API. Devuelve undefined si el token no es legible.
 */
export function tokenExpiresAt(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (payload === undefined) return undefined;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
