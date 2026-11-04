import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';

/** Usuario autenticado, extraído del JWT. */
export interface AuthUser {
  id: number;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así lo exige @types/express
  namespace Express {
    interface Request {
      /** Solo está definido en rutas protegidas por requireAuth. */
      user?: AuthUser;
    }
  }
}

interface RequireAuthOptions {
  jwtSecret: string;
}

// El esquema es insensible a mayúsculas (RFC 7235); el token no puede contener espacios.
const BEARER_PATTERN = /^Bearer +(\S+)$/i;

function unauthorized(res: Response, message: string): void {
  // RFC 6750: un 401 debe indicar qué esquema de autenticación se espera.
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({ error: 'Unauthorized', message });
}

// Un token con firma válida pero sin estos campos no lo emitió auth.service: se rechaza.
function toAuthUser(payload: string | jwt.JwtPayload): AuthUser | undefined {
  if (typeof payload === 'string') return undefined;
  const { sub, email } = payload;
  const id = Number(sub);
  if (typeof sub !== 'string' || !Number.isSafeInteger(id) || id <= 0 || typeof email !== 'string') {
    return undefined;
  }
  return { id, email };
}

/**
 * Usuario de una ruta protegida por requireAuth. Si falta es un error de programación
 * (la ruta no se protegió), no del cliente: por eso lanza en vez de devolver undefined.
 */
export function getAuthUser(req: Request): AuthUser {
  if (req.user === undefined) {
    throw new Error('getAuthUser se usó en una ruta sin requireAuth');
  }
  return req.user;
}

/** Exige un JWT válido en `Authorization: Bearer <token>` y lo deja en `req.user`. */
export function createRequireAuth({ jwtSecret }: RequireAuthOptions): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization');
    if (header === undefined) {
      unauthorized(res, 'Falta el token de autenticación');
      return;
    }

    const token = BEARER_PATTERN.exec(header)?.[1];
    if (token === undefined) {
      unauthorized(res, 'El header Authorization debe tener el formato "Bearer <token>"');
      return;
    }

    let payload: string | jwt.JwtPayload;
    try {
      // algorithms fijo: impide tokens con alg "none" o firmados con otro algoritmo.
      payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    } catch (err) {
      unauthorized(res, err instanceof jwt.TokenExpiredError ? 'El token ha expirado' : 'Token inválido');
      return;
    }

    const user = toAuthUser(payload);
    if (user === undefined) {
      unauthorized(res, 'Token inválido');
      return;
    }

    req.user = user;
    next();
  };
}
