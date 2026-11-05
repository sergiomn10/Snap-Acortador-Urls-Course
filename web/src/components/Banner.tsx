import type { ReactNode } from 'react';
import styles from './Banner.module.css';

interface BannerProps {
  children: ReactNode;
  /** `error` se anuncia de inmediato (role="alert"); `info` y `success`, con cortesía (role="status"). */
  tone?: 'error' | 'info' | 'success';
}

/** Mensaje general de un formulario o una sección. */
export function Banner({ children, tone = 'error' }: BannerProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`${styles.banner} ${styles[tone]}`}>
      {children}
    </div>
  );
}
