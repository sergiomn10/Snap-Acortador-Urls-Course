import type { MyUrl } from '../api/types.ts';
import { Banner } from '../components/Banner.tsx';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '../lib/format.ts';
import { errorMessage } from '../pages/error-message.ts';
import { useMyUrls } from '../urls/queries.ts';
import { CopyButton } from './CopyButton.tsx';
import styles from './dashboard.module.css';

/** "http://localhost:3000/abc" → "localhost:3000/abc": el esquema solo ocupa sitio. */
const withoutScheme = (url: string) => url.replace(/^https?:\/\//, '');

function UrlRow({ item, highlighted }: { item: MyUrl; highlighted: boolean }) {
  return (
    <tr className={highlighted ? styles.highlight : undefined}>
      <td data-label="Enlace">
        <span className={styles.shortCell}>
          <a href={item.shortUrl} target="_blank" rel="noopener noreferrer" className={styles.shortLink}>
            {withoutScheme(item.shortUrl)}
          </a>
          <CopyButton text={item.shortUrl} label={`Copiar ${item.shortUrl}`} />
        </span>
      </td>
      <td data-label="Destino" className={styles.destination}>
        <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.url}>
          {withoutScheme(item.url)}
        </a>
      </td>
      <td data-label="Clics" className={styles.numeric}>
        {formatNumber(item.clickCount)}
      </td>
      <td data-label="Último clic">
        {item.lastClickAt === null ? (
          <span className={styles.muted}>Nunca</span>
        ) : (
          <time dateTime={item.lastClickAt} title={formatDateTime(item.lastClickAt)}>
            {formatRelative(item.lastClickAt)}
          </time>
        )}
      </td>
      <td data-label="Creada">
        <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
          {formatDate(item.createdAt)}
        </time>
      </td>
    </tr>
  );
}

/** Listado de GET /urls/mine. `highlightCode` resalta la URL recién creada. */
export function UrlTable({ highlightCode }: { highlightCode: string | undefined }) {
  const { data, error, isPending, refetch } = useMyUrls();

  let content;
  if (error !== null && data === undefined) {
    content = (
      <Banner>
        No se pudieron cargar tus URLs: {errorMessage(error)}{' '}
        <button type="button" className={styles.linkButton} onClick={() => void refetch()}>
          Reintentar
        </button>
      </Banner>
    );
  } else if (isPending) {
    content = <p className={styles.muted}>Cargando tus URLs…</p>;
  } else if (data.length === 0) {
    content = <p className={styles.empty}>Aún no has acortado ninguna URL. Usa el formulario de arriba para crear la primera.</p>;
  } else {
    content = (
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Enlace</th>
            <th scope="col">Destino</th>
            <th scope="col" className={styles.numeric}>
              Clics
            </th>
            <th scope="col">Último clic</th>
            <th scope="col">Creada</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <UrlRow key={item.code} item={item} highlighted={item.code === highlightCode} />
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="urls-title">
      <div className={styles.cardHeader}>
        <h2 id="urls-title" className={styles.cardTitle}>
          Tus URLs{data !== undefined && data.length > 0 && <span className={styles.count}>{data.length}</span>}
        </h2>
      </div>
      {content}
    </section>
  );
}
