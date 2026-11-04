import type { DatabaseSync } from 'node:sqlite';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { config } from '../../config.ts';
import { createDatabase } from '../../db/database.ts';
import { listen, type TestServer } from '../../testing/listen.ts';

interface ShortUrlBody {
  code: string;
  url: string;
  createdAt: string;
  userId: number | null;
  shortUrl: string;
}

interface Session {
  userId: number;
  token: string;
}

describe('módulo urls', () => {
  let db: DatabaseSync;
  let server: TestServer;
  let ana: Session;
  let bea: Session;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    server = await listen(createApp({ db, saltRounds: 4 }));
    ana = await register('ana@example.com');
    bea = await register('bea@example.com');
  });

  afterAll(async () => {
    await server.close();
    db.close();
  });

  async function register(email: string): Promise<Session> {
    const res = await fetch(`${server.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'contraseña-segura', name: email }),
    });
    const { user, token } = (await res.json()) as { user: { id: number }; token: string };
    return { userId: user.id, token };
  }

  // null = sin token (undefined activaría el valor por defecto).
  function shorten(body: unknown, session: Session | null = ana): Promise<Response> {
    return fetch(`${server.baseUrl}/urls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(session && { authorization: `Bearer ${session.token}` }),
      },
      body: JSON.stringify(body),
    });
  }

  async function createUrl(url: string, session: Session = ana): Promise<ShortUrlBody> {
    return (await (await shorten({ url }, session)).json()) as ShortUrlBody;
  }

  function remove(code: string, session?: Session): Promise<Response> {
    return fetch(`${server.baseUrl}/urls/${code}`, {
      method: 'DELETE',
      headers: session ? { authorization: `Bearer ${session.token}` } : {},
    });
  }

  describe('POST /urls', () => {
    it('crea un código corto asociado al usuario autenticado', async () => {
      const res = await shorten({ url: 'https://example.com/una/ruta/larga?x=1' });

      expect(res.status).toBe(201);
      const body = (await res.json()) as ShortUrlBody;
      expect(body.code).toMatch(/^[A-Za-z0-9]{7}$/);
      expect(body.url).toBe('https://example.com/una/ruta/larga?x=1');
      expect(body.userId).toBe(ana.userId);
      expect(body.shortUrl).toBe(`${server.baseUrl}/${body.code}`);
      expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
    });

    it('asocia cada URL a quien la crea', async () => {
      const deAna = await createUrl('https://example.com/ana', ana);
      const deBea = await createUrl('https://example.com/bea', bea);

      expect(deAna.userId).toBe(ana.userId);
      expect(deBea.userId).toBe(bea.userId);
    });

    it('genera códigos distintos para la misma URL', async () => {
      const a = await createUrl('https://example.com');
      const b = await createUrl('https://example.com');

      expect(a.code).not.toBe(b.code);
    });

    it('responde 401 sin token y no crea nada', async () => {
      const before = ((await (await fetch(`${server.baseUrl}/urls`)).json()) as unknown[]).length;

      const res = await shorten({ url: 'https://example.com/anonima' }, null);

      expect(res.status).toBe(401);
      const after = ((await (await fetch(`${server.baseUrl}/urls`)).json()) as unknown[]).length;
      expect(after).toBe(before);
    });

    it('responde 401 con un token inválido', async () => {
      const res = await shorten({ url: 'https://example.com' }, { userId: 0, token: 'no-es-un-jwt' });

      expect(res.status).toBe(401);
    });

    it('responde 401 si el usuario del token no existe', async () => {
      const token = jwt.sign({ email: 'fantasma@example.com' }, config.jwtSecret, {
        algorithm: 'HS256',
        subject: '9999',
        expiresIn: '1h',
      });

      const res = await shorten({ url: 'https://example.com' }, { userId: 9999, token });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: 'Unauthorized',
        message: 'El usuario del token no existe',
      });
    });

    it('comprueba la autenticación antes que el body', async () => {
      const res = await shorten({ url: 'no es una url' }, null);

      expect(res.status).toBe(401);
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
      const res = await fetch(`${server.baseUrl}/urls`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ana.token}` },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /urls/:code', () => {
    it('el creador puede borrar su URL: 204 y deja de redirigir', async () => {
      const { code } = await createUrl('https://example.com/borrar');

      const res = await remove(code, ana);

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      const redirect = await fetch(`${server.baseUrl}/${code}`, { redirect: 'manual' });
      expect(redirect.status).toBe(404);
    });

    it('responde 403 si la URL es de otro usuario y no la borra', async () => {
      const { code } = await createUrl('https://example.com/de-ana', ana);

      const res = await remove(code, bea);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'Forbidden',
        message: 'Solo el creador puede borrar esta URL',
      });
      const redirect = await fetch(`${server.baseUrl}/${code}`, { redirect: 'manual' });
      expect(redirect.status).toBe(302);
    });

    it('responde 403 con una URL sin dueño (anterior a la autenticación)', async () => {
      db.prepare(
        "INSERT INTO urls (code, original_url, created_at) VALUES ('legacy1', 'https://example.com', '2026-01-01T00:00:00.000Z')",
      ).run();

      const res = await remove('legacy1', ana);

      expect(res.status).toBe(403);
    });

    it('responde 401 sin token y no la borra', async () => {
      const { code } = await createUrl('https://example.com/sin-token');

      const res = await remove(code);

      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
      const redirect = await fetch(`${server.baseUrl}/${code}`, { redirect: 'manual' });
      expect(redirect.status).toBe(302);
    });

    it('responde 404 si el código no existe', async () => {
      const res = await remove('noexiste', ana);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: 'Not Found',
        message: 'El código noexiste no existe',
      });
    });

    it('responde 404 al borrar dos veces', async () => {
      const { code } = await createUrl('https://example.com/dos-veces');
      await remove(code, ana);

      const res = await remove(code, ana);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /:code (público)', () => {
    it('redirige con 302 a la URL original sin necesidad de token', async () => {
      const { code } = await createUrl('https://example.com/destino');

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

  describe('GET /urls (público)', () => {
    it('lista las URLs de todos los usuarios sin necesidad de token', async () => {
      const created = await createUrl('https://example.com/ultima', bea);

      const res = await fetch(`${server.baseUrl}/urls`);

      expect(res.status).toBe(200);
      const list = (await res.json()) as ShortUrlBody[];
      expect(list[0]).toEqual({
        code: created.code,
        url: created.url,
        createdAt: created.createdAt,
        userId: bea.userId,
      });
      expect(new Set(list.map((u) => u.userId))).toEqual(new Set([ana.userId, bea.userId, null]));
    });
  });
});
