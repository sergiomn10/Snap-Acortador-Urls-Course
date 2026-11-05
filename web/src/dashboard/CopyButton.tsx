import { useEffect, useState } from 'react';
import styles from './dashboard.module.css';

type State = 'idle' | 'copied' | 'failed';

const LABELS: Record<State, string> = { idle: 'Copiar', copied: 'Copiado', failed: 'No se pudo copiar' };

/** Copia `text` al portapapeles. El resultado se anuncia a lectores de pantalla. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      // Solo existe en contextos seguros (https o localhost).
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <button type="button" className={styles.copy} onClick={copy} aria-label={`${label}: ${LABELS[state]}`}>
      <span aria-live="polite">{LABELS[state]}</span>
    </button>
  );
}
