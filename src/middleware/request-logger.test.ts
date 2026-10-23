import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listen, type TestServer } from '../testing/listen.ts';
import { createErrorHandler, notFoundHandler } from './errors.ts';
import { createRequestLogger } from './request-logger.ts';

describe('createRequestLogger', () => {
  const lines: string[] = [];
  let server: TestServer;

  beforeAll(async () => {
    const app = express();
    app.use(createRequestLogger((line) => lines.push(line)));
    app.use(express.json());
    app.post('/login', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/boom', () => {
      throw new Error('boom');
    });
    app.use(notFoundHandler);
    app.use(createErrorHandler({ exposeMessage: false }));
    server = await listen(app);
  });

  afterAll(() => server.close());

  beforeEach(() => {
    lines.length = 0;
  });

  // La línea se escribe en 'finish', que puede llegar justo después que el cliente reciba la respuesta.
  const waitForLog = () => expect.poll(() => lines.length).toBe(1);

  it('registra método, ruta, status y duración', async () => {
    await fetch(`${server.baseUrl}/no-existe`);
    await waitForLog();

    expect(lines[0]).toMatch(/^GET \/no-existe → 404 \(\d+ms\)$/);
  });

  it('registra peticiones que acaban en error 500', async () => {
    await fetch(`${server.baseUrl}/boom`);
    await waitForLog();

    expect(lines[0]).toMatch(/^GET \/boom → 500 \(\d+ms\)$/);
  });

  it('no registra body ni query string', async () => {
    await fetch(`${server.baseUrl}/login?token=secreto-query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'secreto-body' }),
    });
    await waitForLog();

    expect(lines[0]).toMatch(/^POST \/login → 200 \(\d+ms\)$/);
    expect(lines[0]).not.toMatch(/secreto/);
  });
});
