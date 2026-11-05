import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PERIODS, type Period } from '../api/types.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { CreateUrlForm } from '../dashboard/CreateUrlForm.tsx';
import styles from '../dashboard/dashboard.module.css';
import { StatsSummary } from '../dashboard/StatsSummary.tsx';
import { UrlTable } from '../dashboard/UrlTable.tsx';

const DEFAULT_PERIOD: Period = 30;

/** ?days=7|30|90; cualquier otro valor cae al periodo por defecto, como en la API. */
function parsePeriod(value: string | null): Period {
  return PERIODS.find((days) => String(days) === value) ?? DEFAULT_PERIOD;
}

export function DashboardPage() {
  const { session, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const [lastCreated, setLastCreated] = useState<string>();
  const days = parsePeriod(params.get('days'));

  function changeDays(next: Period) {
    // replace: cambiar de periodo no debería llenar el historial del botón "atrás".
    setParams(next === DEFAULT_PERIOD ? {} : { days: String(next) }, { replace: true });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>Snap</span>
        <div className={styles.user}>
          <span className={styles.userName} title={session?.user.email}>
            {session?.user.name}
          </span>
          <button type="button" className={styles.secondary} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Dashboard</h1>
        <CreateUrlForm onCreated={(created) => setLastCreated(created.code)} />
        <StatsSummary days={days} onDaysChange={changeDays} />
        <UrlTable highlightCode={lastCreated} />
      </main>
    </div>
  );
}
