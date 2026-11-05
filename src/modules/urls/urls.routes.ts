import { Router, type Request, type RequestHandler } from 'express';
import { getAuthUser } from '../../middleware/require-auth.ts';
import type { TrackClick } from '../analytics/click-tracker.ts';
import { AliasTakenError, UnknownUserError, type UrlsRepository } from './urls.repository.ts';

const MAX_URL_LENGTH = 2048;

export const MIN_ALIAS_LENGTH = 3;
export const MAX_ALIAS_LENGTH = 32;
// Solo caracteres que no necesitan codificarse en una ruta.
const ALIAS_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${MIN_ALIAS_LENGTH},${MAX_ALIAS_LENGTH}}$`);

// Rutas de un segmento montadas en app.ts antes de GET /:code: un alias con ese nombre
// nunca llegaría a redirigir. Express no distingue mayúsculas, así que se compara en minúsculas.
export const RESERVED_ALIASES: readonly string[] = ['auth', 'dashboard', 'health', 'urls'];

/** Devuelve el mensaje de error, o undefined si el alias es válido. */
function validateAlias(alias: unknown): string | undefined {
  if (typeof alias !== 'string' || !ALIAS_PATTERN.test(alias)) {
    return `El campo "alias" debe tener entre ${MIN_ALIAS_LENGTH} y ${MAX_ALIAS_LENGTH} caracteres: letras, números, "-" o "_"`;
  }
  if (RESERVED_ALIASES.includes(alias.toLowerCase())) {
    return `El alias "${alias}" está reservado`;
  }
  return undefined;
}

function shortUrlOf(req: Request, code: string): string {
  return `${req.protocol}://${req.get('host')}/${code}`;
}

// Solo http/https: evita guardar javascript:, data:, file:, etc. que luego se redirigirían.
function parseHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || !URL.canParse(value)) {
    return undefined;
  }
  const { protocol, href } = new URL(value);
  return protocol === 'http:' || protocol === 'https:' ? href : undefined;
}

/**
 * API de gestión, montada en /urls. El listado general es público; crear, borrar
 * y listar las propias (/urls/mine) exigen requireAuth.
 */
export function createUrlsRouter(repository: UrlsRepository, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post('/', requireAuth, (req, res) => {
    const { url, alias } = (req.body ?? {}) as { url?: unknown; alias?: unknown };
    const validUrl = parseHttpUrl(url);
    if (validUrl === undefined) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'El campo "url" debe ser una URL http(s) válida',
      });
      return;
    }

    // El alias es opcional: solo se valida si viene en el body.
    const aliasError = alias === undefined ? undefined : validateAlias(alias);
    if (aliasError !== undefined) {
      res.status(400).json({ error: 'Bad Request', message: aliasError });
      return;
    }

    let created;
    try {
      created = repository.create(validUrl, getAuthUser(req).id, alias as string | undefined);
    } catch (err) {
      if (err instanceof AliasTakenError) {
        res.status(409).json({ error: 'Conflict', message: err.message });
        return;
      }
      // Token con firma válida de un usuario que ya no existe: credencial inservible.
      if (!(err instanceof UnknownUserError)) throw err;
      res.status(401).json({ error: 'Unauthorized', message: 'El usuario del token no existe' });
      return;
    }

    res.status(201).json({ ...created, shortUrl: shortUrlOf(req, created.code) });
  });

  router.get('/', (_req, res) => {
    res.status(200).json(repository.list());
  });

  // Antes de cualquier GET /:param que se añada a este router.
  router.get('/mine', requireAuth, (req, res) => {
    const urls = repository.listByUser(getAuthUser(req).id);
    res.status(200).json(urls.map((url) => ({ ...url, shortUrl: shortUrlOf(req, url.code) })));
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

/** Redirección pública, montada en la raíz: GET /:code. Cada visita se registra con trackClick. */
export function createRedirectRouter(repository: UrlsRepository, trackClick: TrackClick): Router {
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

    trackClick(found.code, req);
    // 302 y no 301: el navegador no la cachea, así cada visita pasa por el servidor
    // (necesario para las analíticas).
    res.redirect(302, found.url);
  });

  return router;
}
