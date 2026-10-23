import type { RequestHandler } from 'express';

type LogFn = (line: string) => void;

/**
 * Registra cada petición al terminar: `GET /health → 200 (12ms)`.
 * Solo se loguean método, ruta (sin query string), status y duración;
 * nunca el body, la query ni los headers, que pueden contener secretos.
 */
export function createRequestLogger(log: LogFn = console.log): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    const { method, path } = req;
    let logged = false;

    const done = () => {
      if (logged) return;
      logged = true;
      const ms = Math.round(performance.now() - start);
      const status = res.writableFinished ? String(res.statusCode) : 'aborted';
      log(`${method} ${path} → ${status} (${ms}ms)`);
    };

    // 'finish' cuando la respuesta se envía; 'close' cubre conexiones cortadas.
    res.once('finish', done);
    res.once('close', done);
    next();
  };
}
