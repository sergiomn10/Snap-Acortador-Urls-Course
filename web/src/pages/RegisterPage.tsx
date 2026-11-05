import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../api/client.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { MIN_PASSWORD_LENGTH, validateRegister, type FieldErrors } from '../auth/validation.ts';
import { Banner } from '../components/Banner.tsx';
import { FormField } from '../components/FormField.tsx';
import { errorMessage } from './error-message.ts';
import styles from './AuthLayout.module.css';
import { AuthLayout } from './AuthLayout.tsx';

type Field = 'email' | 'password' | 'name';

export function RegisterPage() {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<{ message: string; emailTaken: boolean }>();
  const [submitting, setSubmitting] = useState(false);

  const loginLink = { pathname: '/login', search: params.toString() };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateRegister({ email, password, name });
    setFieldErrors(errors);
    setFormError(undefined);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      // Con la sesión iniciada, PublicOnly redirige al destino.
      await register({ email, password, name });
    } catch (err) {
      setFormError({
        message: errorMessage(err),
        emailTaken: err instanceof ApiError && err.status === 409,
      });
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Acorta enlaces y mide cuántas visitas reciben."
      footer={
        <>
          ¿Ya tienes cuenta? <Link to={loginLink}>Inicia sesión</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError !== undefined && (
          <Banner>
            {formError.message}
            {formError.emailTaken && (
              <>
                {' '}
                <Link to={loginLink}>¿Quieres iniciar sesión?</Link>
              </>
            )}
          </Banner>
        )}
        <FormField
          label="Nombre"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          autoFocus
        />
        <FormField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <FormField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
        />
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthLayout>
  );
}
