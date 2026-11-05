import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client.ts';
import type { ShortUrl } from '../api/types.ts';
import type { FieldErrors } from '../auth/validation.ts';
import { Banner } from '../components/Banner.tsx';
import { FormField } from '../components/FormField.tsx';
import { errorMessage } from '../pages/error-message.ts';
import { useCreateUrl } from '../urls/queries.ts';
import { MAX_ALIAS_LENGTH, MIN_ALIAS_LENGTH, parseCreateUrl, type UrlField } from '../urls/validation.ts';
import { CopyButton } from './CopyButton.tsx';
import styles from './dashboard.module.css';

interface CreateUrlFormProps {
  onCreated: (created: ShortUrl) => void;
}

export function CreateUrlForm({ onCreated }: CreateUrlFormProps) {
  const create = useCreateUrl();
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<UrlField>>({});
  const [formError, setFormError] = useState<string>();
  const [created, setCreated] = useState<ShortUrl>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setCreated(undefined);

    const parsed = parseCreateUrl({ url, alias });
    setFieldErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;

    try {
      const result = await create.mutateAsync(parsed.input);
      setCreated(result);
      setUrl('');
      setAlias('');
      onCreated(result);
    } catch (err) {
      // 401: AuthContext ya ha cerrado la sesión y se redirige al login.
      if (err instanceof ApiError && err.status === 401) return;
      // 409: el alias está cogido; el error va junto al campo para corregirlo ahí.
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ alias: err.message });
        return;
      }
      setFormError(errorMessage(err));
    }
  }

  return (
    <section className={styles.card} aria-labelledby="create-url-title">
      <h2 id="create-url-title" className={styles.cardTitle}>
        Acortar una URL
      </h2>
      <form className={styles.createForm} onSubmit={handleSubmit} noValidate>
        {formError !== undefined && <Banner>{formError}</Banner>}
        {created !== undefined && (
          <Banner tone="success">
            <span className={styles.createdLine}>
              Enlace creado:{' '}
              <a href={created.shortUrl} target="_blank" rel="noopener noreferrer">
                {created.shortUrl}
              </a>
              <CopyButton text={created.shortUrl} label="Copiar el enlace creado" />
            </span>
          </Banner>
        )}
        <div className={styles.createFields}>
          <div className={styles.urlField}>
            <FormField
              label="URL larga"
              type="url"
              name="url"
              inputMode="url"
              placeholder="https://example.com/una/ruta/muy/larga"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={fieldErrors.url}
            />
          </div>
          <div className={styles.aliasField}>
            <FormField
              label="Alias (opcional)"
              name="alias"
              autoComplete="off"
              spellCheck={false}
              placeholder="mi-enlace"
              maxLength={MAX_ALIAS_LENGTH}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              error={fieldErrors.alias}
              hint={`${MIN_ALIAS_LENGTH}–${MAX_ALIAS_LENGTH} caracteres: letras, números, - o _`}
            />
          </div>
          <button type="submit" className={styles.primary} disabled={create.isPending}>
            {create.isPending ? 'Acortando…' : 'Acortar'}
          </button>
        </div>
      </form>
    </section>
  );
}
