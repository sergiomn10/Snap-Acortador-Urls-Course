import type { DatabaseSync } from 'node:sqlite';

export interface Totals {
  urls: number;
  clicks: number;
  urlsWithClicks: number;
  lastClickAt: string | null;
}

export interface PeriodComparison {
  clicks: number;
  previousClicks: number;
  uniqueVisitors: number;
}

export interface DailyClicks {
  date: string;
  clicks: number;
  uniqueVisitors: number;
}

/** Fechas ISO; `from` y `to` acotan el periodo actual [from, to) y `prevFrom` el anterior. */
export interface DateWindow {
  prevFrom: string;
  from: string;
  to: string;
}

export interface DashboardRepository {
  totals: (userId: number) => Totals;
  comparePeriods: (userId: number, window: DateWindow) => PeriodComparison;
  /** Solo los días con clicks, ordenados. */
  daily: (userId: number, window: DateWindow) => DailyClicks[];
}

export function createDashboardRepository(db: DatabaseSync): DashboardRepository {
  // Lee los contadores de urls (mantenidos por trigger), no los clicks: el coste
  // depende del número de URLs del usuario y no de su histórico de visitas.
  const selectTotals = db.prepare(`
    SELECT COUNT(*)                         AS urls,
           COALESCE(SUM(click_count), 0)    AS clicks,
           COALESCE(SUM(click_count > 0), 0) AS urlsWithClicks,
           MAX(last_click_at)               AS lastClickAt
    FROM urls
    WHERE user_id = :userId
  `);

  // Las dos queries de clicks recorren urls_user_id y después el rango de fechas
  // de cada URL en el índice cubriente clicks_url_time. Las fechas se comparan como
  // texto: es correcto porque todas tienen el formato de toISOString().
  const selectComparison = db.prepare(`
    SELECT COALESCE(SUM(c.clicked_at >= :from), 0) AS clicks,
           COALESCE(SUM(c.clicked_at <  :from), 0) AS previousClicks,
           COUNT(DISTINCT CASE WHEN c.clicked_at >= :from THEN c.visitor END) AS uniqueVisitors
    FROM urls u
    JOIN clicks c ON c.url_id = u.id
    WHERE u.user_id = :userId AND c.device <> 'bot'
      AND c.clicked_at >= :prevFrom AND c.clicked_at < :to
  `);

  const selectDaily = db.prepare(`
    SELECT date(c.clicked_at)        AS date,
           COUNT(*)                  AS clicks,
           COUNT(DISTINCT c.visitor) AS uniqueVisitors
    FROM urls u
    JOIN clicks c ON c.url_id = u.id
    WHERE u.user_id = :userId AND c.device <> 'bot'
      AND c.clicked_at >= :from AND c.clicked_at < :to
    GROUP BY date(c.clicked_at)
    ORDER BY date
  `);

  return {
    totals(userId) {
      return { ...(selectTotals.get({ userId }) as unknown as Totals) };
    },

    comparePeriods(userId, { prevFrom, from, to }) {
      return {
        ...(selectComparison.get({ userId, prevFrom, from, to }) as unknown as PeriodComparison),
      };
    },

    daily(userId, { from, to }) {
      return (selectDaily.all({ userId, from, to }) as unknown as DailyClicks[]).map((row) => ({
        ...row,
      }));
    },
  };
}
