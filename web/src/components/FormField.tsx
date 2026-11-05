import { useId, type InputHTMLAttributes } from 'react';
import styles from './FormField.module.css';

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

/** Input con label y mensaje de error asociados para lectores de pantalla. */
export function FormField({ label, error, hint, ...input }: FormFieldProps) {
  const id = useId();
  const describedBy = error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error !== undefined ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p id={`${id}-hint`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
