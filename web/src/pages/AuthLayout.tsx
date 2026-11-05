import type { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}

/** Marco común de las páginas de login y registro. */
export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>Snap</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {children}
        <p className={styles.footer}>{footer}</p>
      </div>
    </main>
  );
}
