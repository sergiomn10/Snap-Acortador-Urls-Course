import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.method} ${req.path} no existe`,
  });
};

interface ErrorHandlerOptions {
  exposeMessage: boolean;
}

// Errores de cliente generados por Express/body-parser (p. ej. JSON malformado)
// traen status 4xx y expose=true; se respetan en lugar de convertirlos en 500.
function clientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  if (typeof status === 'number' && status >= 400 && status < 500 && expose === true) {
    return status;
  }
  return undefined;
}

export function createErrorHandler({ exposeMessage }: ErrorHandlerOptions): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const clientStatus = clientErrorStatus(err);
    if (clientStatus !== undefined) {
      res.status(clientStatus).json({ error: 'Bad Request', message: (err as Error).message });
      return;
    }

    console.error(err);

    const body: { error: string; message?: string } = { error: 'Internal Server Error' };
    if (exposeMessage && err instanceof Error) {
      body.message = err.message;
    }
    res.status(500).json(body);
  };
}
