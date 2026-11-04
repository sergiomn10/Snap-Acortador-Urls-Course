import type { DatabaseSync } from 'node:sqlite';
import express, { type Express } from 'express';
import { config } from './config.ts';
import { createErrorHandler, notFoundHandler } from './middleware/errors.ts';
import { createRequestLogger } from './middleware/request-logger.ts';
import { createRequireAuth } from './middleware/require-auth.ts';
import { createUsersRepository } from './modules/auth/auth.repository.ts';
import { createAuthRouter } from './modules/auth/auth.routes.ts';
import { createAuthService } from './modules/auth/auth.service.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { createUrlsRepository } from './modules/urls/urls.repository.ts';
import { createRedirectRouter, createUrlsRouter } from './modules/urls/urls.routes.ts';

interface AppOptions {
  db: DatabaseSync;
  /** Coste de bcrypt. Solo se baja en tests; por defecto usa el del servicio. */
  saltRounds?: number;
}

export function createApp({ db, saltRounds }: AppOptions): Express {
  const urlsRepository = createUrlsRepository(db);
  const authService = createAuthService({
    users: createUsersRepository(db),
    jwtSecret: config.jwtSecret,
    saltRounds,
  });
  const requireAuth = createRequireAuth({ jwtSecret: config.jwtSecret });

  const app = express();

  app.disable('x-powered-by');

  // Primero de la cadena para registrar todas las peticiones, incluidas 404 y errores.
  // Desactivado en tests para no ensuciar la salida de Vitest.
  if (config.env !== 'test') {
    app.use(createRequestLogger());
  }

  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/auth', createAuthRouter(authService));
  app.use('/urls', createUrlsRouter(urlsRepository, requireAuth));
  // Último router: GET /:code captura cualquier ruta de un segmento no definida antes.
  app.use('/', createRedirectRouter(urlsRepository));

  // Deben ir siempre al final de la cadena.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeMessage: !config.isProduction }));

  return app;
}
