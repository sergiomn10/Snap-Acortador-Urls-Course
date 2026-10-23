import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabase } from '../db/database.ts';
import { listen, type TestServer } from '../testing/listen.ts';
import { createErrorHandler, notFoundHandler } from './errors.ts';

describe('notFoundHandler', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await listen(createApp({ db: createDatabase(':memory:') }));
  });

  afterAll(() => server.close());

  // Rutas de un solo segmento las captura GET /:code, por eso se usan dos segmentos.
  it('devuelve 404 con JSON para una ruta inexistente', async () => {
    const res = await fetch(`${server.baseUrl}/no/existe`);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({
      error: 'Not Found',
      message: 'La ruta GET /no/existe no existe',
    });
  });

  it('devuelve 400 (no 500) ante un body JSON malformado', async () => {
    const res = await fetch(`${server.baseUrl}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{malformado',
    });

    expect(res.status).toBe(400);
  });
});

function buildFailingApp(exposeMessage: boolean) {
  const app = express();
  app.get('/sync', () => {
    throw new Error('secreto interno');
  });
  app.get('/async', async () => {
    throw new Error('secreto interno async');
  });
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeMessage }));
  return app;
}

describe('createErrorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('en desarrollo', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await listen(buildFailingApp(true));
    });

    afterAll(() => server.close());

    it.each(['/sync', '/async'])('responde 500 con el mensaje en %s', async (path) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await fetch(`${server.baseUrl}${path}`);

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('Internal Server Error');
      expect(body.message).toMatch(/secreto interno/);
    });

    it('el servidor sigue respondiendo tras un error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await fetch(`${server.baseUrl}/sync`);
      await fetch(`${server.baseUrl}/async`);
      const res = await fetch(`${server.baseUrl}/ok`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  describe('en producción', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await listen(buildFailingApp(false));
    });

    afterAll(() => server.close());

    it('responde 500 sin exponer detalles internos', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await fetch(`${server.baseUrl}/sync`);

      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error' });
      expect(text).not.toMatch(/secreto|stack|at /);
    });
  });
});
