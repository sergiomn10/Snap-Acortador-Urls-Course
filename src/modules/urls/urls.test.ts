import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createDatabase } from '../../db/database.ts';
import { listen, type TestServer } from '../../testing/listen.ts';

interface ShortUrlBody {
  code: string;
  url: string;
  createdAt: string;
  shortUrl: string;
}

describe('módulo urls', () => {
  let db: DatabaseSync;
  let server: TestServer;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    server = await listen(createApp({ db }));
  });

  afterAll(async () => {
    await server.close();
    db.close();
  });

  function shorten(body: unknown): Promise<Response> {
    return fetch(`${server.baseUrl}/urls`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  describe('POST /urls', () => {
    it('crea un código corto para una URL válida', async () => {
      const res = await shorten({ url: 'https://example.com/una/ruta/larga?x=1' });

      expect(res.status).toBe(201);
      const body = (await res.json()) as ShortUrlBody;
      expect(body.code).toMatch(/^[A-Za-z0-9]{7}$/);
      expect(body.url).toBe('https://example.com/una/ruta/larga?x=1');
      expect(body.shortUrl).toBe(`${server.baseUrl}/${body.code}`);
      expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
    });

    it('genera códigos distintos para la misma URL', async () => {
      const a = (await (await shorten({ url: 'https://example.com' })).json()) as ShortUrlBody;
      const b = (await (await shorten({ url: 'https://example.com' })).json()) as ShortUrlBody;

      expect(a.code).not.toBe(b.code);
    });

    it.each([
      ['sin campo url', {}],
      ['url no string', { url: 123 }],
      ['texto que no es URL', { url: 'no es una url' }],
      ['protocolo no http(s)', { url: 'javascript:alert(1)' }],
      ['protocolo ftp', { url: 'ftp://example.com/archivo' }],
      ['URL demasiado larga', { url: `https://example.com/${'a'.repeat(2048)}` }],
    ])('responde 400 con %s', async (_caso, body) => {
      const res = await shorten(body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Bad Request',
        message: 'El campo "url" debe ser una URL http(s) válida',
      });
    });

    it('responde 400 si no se envía body', async () => {
      const res = await fetch(`${server.baseUrl}/urls`, { method: 'POST' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /:code', () => {
    it('redirige con 302 a la URL original', async () => {
      const { code } = (await (await shorten({ url: 'https://example.com/destino' })).json()) as ShortUrlBody;

      const res = await fetch(`${server.baseUrl}/${code}`, { redirect: 'manual' });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://example.com/destino');
    });

    it('responde 404 si el código no existe', async () => {
      const res = await fetch(`${server.baseUrl}/noexiste`, { redirect: 'manual' });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: 'Not Found',
        message: 'El código noexiste no existe',
      });
    });

    it('no interfiere con /health', async () => {
      const res = await fetch(`${server.baseUrl}/health`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /urls', () => {
    it('lista las URLs creadas, la más reciente primero', async () => {
      const created = (await (await shorten({ url: 'https://example.com/ultima' })).json()) as ShortUrlBody;

      const res = await fetch(`${server.baseUrl}/urls`);

      expect(res.status).toBe(200);
      const list = (await res.json()) as ShortUrlBody[];
      expect(list[0]).toEqual({ code: created.code, url: created.url, createdAt: created.createdAt });
      expect(list.length).toBeGreaterThan(1);
    });
  });
});
