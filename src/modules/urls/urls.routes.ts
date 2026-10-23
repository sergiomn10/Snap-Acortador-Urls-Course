import { Router } from 'express';
import type { UrlsRepository } from './urls.repository.ts';

const MAX_URL_LENGTH = 2048;

// Solo http/https: evita guardar javascript:, data:, file:, etc. que luego se redirigirían.
function parseHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || !URL.canParse(value)) {
    return undefined;
  }
  const { protocol, href } = new URL(value);
  return protocol === 'http:' || protocol === 'https:' ? href : undefined;
}

/** API de gestión, montada en /urls. */
export function createUrlsRouter(repository: UrlsRepository): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { url } = (req.body ?? {}) as { url?: unknown };
    const validUrl = parseHttpUrl(url);
    if (validUrl === undefined) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'El campo "url" debe ser una URL http(s) válida',
      });
      return;
    }

    const created = repository.create(validUrl);
    res.status(201).json({
      ...created,
      shortUrl: `${req.protocol}://${req.get('host')}/${created.code}`,
    });
  });

  router.get('/', (_req, res) => {
    res.status(200).json(repository.list());
  });

  return router;
}

/** Redirección pública, montada en la raíz: GET /:code. */
export function createRedirectRouter(repository: UrlsRepository): Router {
  const router = Router();

  router.get('/:code', (req, res) => {
    const found = repository.findByCode(req.params.code);
    if (found === undefined) {
      res.status(404).json({
        error: 'Not Found',
        message: `El código ${req.params.code} no existe`,
      });
      return;
    }

    // 302 y no 301: el navegador no la cachea, así cada visita pasa por el servidor
    // (necesario para las analíticas).
    res.redirect(302, found.url);
  });

  return router;
}
