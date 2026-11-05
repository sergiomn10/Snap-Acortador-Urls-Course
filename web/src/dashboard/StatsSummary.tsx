import type { ReactNode } from 'react';
import { PERIODS, type Dashboard, type Period } from '../api/types.ts';
import { Banner } from '../components/Banner.tsx';
import { formatChange, formatNumber, formatRelative } from '../lib/format.ts';
import { errorMessage } from '../pages/error-message.ts';
import { useDashboard } from '../urls/queries.ts';
import styles from './dashboard.module.css';

interface StatsSummaryProps {
  days: Period;
  onDaysChange: (days: Period) => void;
}

function Trend({ trend }: { trend: Dashboard['trend'] }) {
  if (trend.changePct === null) {
    return <span className={styles.muted}>Sin clics en el periodo anterior</span>;
  }
  const direction = trend.changePct > 0 ? 'up' : trend.changePct < 0 ? 'down' : 'flat';
  return (
    <span className={`${styles.trend} ${styles[direction]}`}>
      {formatChange(trend.changePct)} <span className={styles.muted}>vs. periodo anterior</span>
    </span>
  );
}

function StatCard({ label, value, detail }: { label: string; value: number; detail: ReactNode }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{formatNumber(value)}</dd>
      <dd className={styles.statDetail}>{detail}</dd>
    </div>
  );
}

/** Totales y tendencia de GET /dashboard, con selector de periodo. */
export function StatsSummary({ days, onDaysChange }: StatsSummaryProps) {
  const { data, error, isPending, isPlaceholderData, refetch } = useDashboard(days);

  return (
    <section className={styles.card} aria-labelledby="stats-title" aria-busy={isPending || isPlaceholderData}>
      <div className={styles.cardHeader}>
        <h2 id="stats-title" className={styles.cardTitle}>
          Resumen
        </h2>
        <div className={styles.segmented} role="group" aria-label="Periodo">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={period === days}
              onClick={() => onDaysChange(period)}
            >
              {period} días
            </button>
          ))}
        </div>
      </div>

      {error !== null && data === undefined ? (
        <Banner>
          No se pudo cargar el resumen: {errorMessage(error)}{' '}
          <button type="button" className={styles.linkButton} onClick={() => void refetch()}>
            Reintentar
          </button>
        </Banner>
      ) : data === undefined ? (
        <p className={styles.muted}>Cargando resumen…</p>
      ) : (
        <dl className={`${styles.stats} ${isPlaceholderData ? styles.stale : ''}`}>
          <StatCard
            label={`Clics · últimos ${data.period.days} días`}
            value={data.trend.clicks}
            detail={<Trend trend={data.trend} />}
          />
          <StatCard
            label={`Visitantes únicos · últimos ${data.period.days} días`}
            value={data.trend.uniqueVisitors}
            detail={<span className={styles.muted}>Fechas en UTC</span>}
          />
          <StatCard
            label="URLs creadas"
            value={data.totals.urls}
            detail={<span className={styles.muted}>{formatNumber(data.totals.urlsWithClicks)} con algún clic</span>}
          />
          <StatCard
            label="Clics totales"
            value={data.totals.clicks}
            detail={
              <span className={styles.muted}>
                {data.totals.lastClickAt === null
                  ? 'Aún sin clics'
                  : `Último ${formatRelative(data.totals.lastClickAt)}`}
              </span>
            }
          />
        </dl>
      )}
    </section>
  );
}
