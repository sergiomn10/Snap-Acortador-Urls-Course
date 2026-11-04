import type { DailyClicks, DashboardRepository, DateWindow, Totals } from './dashboard.repository.ts';

/** Periodos admitidos, en días. */
export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = 30;

export interface Dashboard {
  period: { days: Period; from: string; to: string; timezone: 'UTC' };
  totals: Totals;
  trend: {
    clicks: number;
    previousClicks: number;
    /** null si el periodo anterior no tuvo clicks: no hay base con la que comparar. */
    changePct: number | null;
    uniqueVisitors: number;
  };
  /** Un elemento por día del periodo, incluidos los días sin clicks. */
  daily: DailyClicks[];
}

export interface DashboardService {
  get: (userId: number, days: Period) => Dashboard;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** El periodo acaba hoy (incluido) y empieza `days - 1` días antes, en días UTC. */
export function periodWindow(now: Date, days: number): DateWindow {
  const today = startOfUtcDay(now);
  const from = today - (days - 1) * DAY_MS;
  return {
    prevFrom: new Date(from - days * DAY_MS).toISOString(),
    from: new Date(from).toISOString(),
    to: new Date(today + DAY_MS).toISOString(),
  };
}

export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** SQLite no devuelve filas para los días sin clicks: se rellenan con ceros. */
export function fillDays(rows: DailyClicks[], window: DateWindow): DailyClicks[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const result: DailyClicks[] = [];
  for (let day = Date.parse(window.from); day < Date.parse(window.to); day += DAY_MS) {
    const date = isoDate(day);
    result.push(byDate.get(date) ?? { date, clicks: 0, uniqueVisitors: 0 });
  }
  return result;
}

interface DashboardServiceOptions {
  repository: DashboardRepository;
  now?: (() => Date) | undefined;
}

export function createDashboardService({
  repository,
  now = () => new Date(),
}: DashboardServiceOptions): DashboardService {
  return {
    get(userId, days) {
      const window = periodWindow(now(), days);
      const comparison = repository.comparePeriods(userId, window);

      return {
        period: {
          days,
          from: isoDate(Date.parse(window.from)),
          to: isoDate(Date.parse(window.to) - DAY_MS),
          timezone: 'UTC',
        },
        totals: repository.totals(userId),
        trend: {
          ...comparison,
          changePct: changePct(comparison.clicks, comparison.previousClicks),
        },
        daily: fillDays(repository.daily(userId, window), window),
      };
    },
  };
}
