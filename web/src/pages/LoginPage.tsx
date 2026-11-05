import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { validateLogin, type FieldErrors } from '../auth/validation.ts';
import { Banner } from '../components/Banner.tsx';
import { FormField } from '../components/FormField.tsx';
import { errorMessage } from './error-message.ts';
import styles from './AuthLayout.module.css';
import { AuthLayout } from './AuthLayout.tsx';

export function LoginPage() {
  const { login, notice } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<'email' | 'password'>>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    setFormError(undefined);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      // Con la sesión iniciada, PublicOnly redirige al destino.
      await login({ email, password });
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Accede a tus enlaces y sus analíticas."
      footer={
        <>
          ¿No tienes cuenta? <Link to={{ pathname: '/register', search: params.toString() }}>Regístrate</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError !== undefined ? (
          <Banner>{formError}</Banner>
        ) : (
          notice !== undefined && <Banner tone="info">{notice}</Banner>
        )}
        <FormField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          autoFocus
        />
        <FormField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
