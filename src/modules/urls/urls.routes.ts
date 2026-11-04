import { Router, type RequestHandler } from 'express';
import { getAuthUser } from '../../middleware/require-auth.ts';
import { UnknownUserError, type UrlsRepository } from './urls.repository.ts';

const MAX_URL_LENGTH = 2048;

// Solo http/https: evita guardar javascript:, data:, file:, etc. que luego se redirigirían.
function parseHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || !URL.canParse(value)) {
    return undefined;
  }
  const { protocol, href } = new URL(value);
  return protocol === 'http:' || protocol === 'https:' ? href : undefined;
}

/**
 * API de gestión, montada en /urls. Leer es público; crear y borrar exigen requireAuth.
 */
export function createUrlsRouter(repository: UrlsRepository, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post('/', requireAuth, (req, res) => {
    const { url } = (req.body ?? {}) as { url?: unknown };
    const validUrl = parseHttpUrl(url);
    if (validUrl === undefined) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'El campo "url" debe ser una URL http(s) válida',
      });
      return;
    }

    let created;
    try {
      created = repository.create(validUrl, getAuthUser(req).id);
    } catch (err) {
      // Token con firma válida de un usuario que ya no existe: credencial inservible.
      if (!(err instanceof UnknownUserError)) throw err;
      res.status(401).json({ error: 'Unauthorized', message: 'El usuario del token no existe' });
      return;
    }

    res.status(201).json({
      ...created,
      shortUrl: `${req.protocol}://${req.get('host')}/${created.code}`,
    });
  });

  router.get('/', (_req, res) => {
    res.status(200).json(repository.list());
  });

  router.delete('/:code', requireAuth, (req, res) => {
    // Con un middleware delante, Express ya no infiere los params a partir de la ruta.
    const { code } = req.params as { code: string };
    const found = repository.findByCode(code);
    if (found === undefined) {
      res.status(404).json({ error: 'Not Found', message: `El código ${code} no existe` });
      return;
    }

    // Las URLs sin dueño (userId null, anteriores a la autenticación) tampoco se pueden borrar.
    if (found.userId !== getAuthUser(req).id) {
      res.status(403).json({ error: 'Forbidden', message: 'Solo el creador puede borrar esta URL' });
      return;
    }

    repository.remove(code);
    res.status(204).end();
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
