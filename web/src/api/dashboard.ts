import { request } from './client.ts';
import type { Dashboard, Period } from './types.ts';

export function getDashboard(token: string, days: Period): Promise<Dashboard> {
  return request<Dashboard>('GET', `/dashboard?days=${days}`, { token });
}
