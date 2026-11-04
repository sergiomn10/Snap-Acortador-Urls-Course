import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/database.ts';
import { createUsersRepository } from '../modules/auth/auth.repository.ts';
import { createAuthService } from '../modules/auth/auth.service.ts';
import { listen, type TestServer } from '../testing/listen.ts';
import { createRequireAuth } from './require-auth.ts';

const SECRET = 'test-secret-de-al-menos-32-caracteres';

function sign(payload: object, options: jwt.SignOptions = {}, secret = SECRET): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h', ...options });
}

function buildProtectedApp() {
  const app = express();
  app.get('/protegida', createRequireAuth({ jwtSecret: SECRET }), (req, res) => {
    res.json({ user: req.user });
  });
  return app;
}

describe('createRequireAuth', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await listen(buildProtectedApp());
  });

  afterAll(() => server.close());

  function get(authorization?: string): Promise<Response> {
    return fetch(`${server.baseUrl}/protegida`, {
      headers: authorization === undefined ? {} : { authorization },
    });
  }

  async function expectUnauthorized(res: Response, message: string | RegExp): Promise<void> {
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toMatch(message);
  }

  describe('con token válido', () => {
    it('deja pasar la petición y adjunta el usuario a req.user', async () => {
      const res = await get(`Bearer ${sign({ email: 'ana@example.com' }, { subject: '7' })}`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: { id: 7, email: 'ana@example.com' } });
    });

    it('acepta el esquema en minúsculas', async () => {
      const res = await get(`bearer ${sign({ email: 'ana@example.com' }, { subject: '7' })}`);

      expect(res.status).toBe(200);
    });

    it('acepta los tokens emitidos por el servicio de autenticación', async () => {
      const db = createDatabase(':memory:');
      const auth = createAuthService({ users: createUsersRepository(db), jwtSecret: SECRET, saltRounds: 4 });
      const { token, user } = await auth.register({ email: 'ana@example.com', password: '12345678', name: 'Ana' });
      db.close();

      const res = await get(`Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: { id: user.id, email: 'ana@example.com' } });
    });
  });

  describe('sin token', () => {
    it('responde 401 si no hay header Authorization', async () => {
      await expectUnauthorized(await get(), 'Falta el token de autenticación');
    });

    it.each([
      ['otro esquema', 'Basic YW5hOjEyMzQ='],
      ['"Bearer" sin token', 'Bearer'],
      ['"Bearer" con espacio final', 'Bearer '],
      ['token sin esquema', sign({ email: 'a@b.c' }, { subject: '1' })],
      ['token con espacios', 'Bearer abc def'],
    ])('responde 401 con %s', async (_caso, header) => {
      await expectUnauthorized(await get(header), /formato "Bearer <token>"/);
    });
  });

  describe('con token expirado o malformado', () => {
    it('responde 401 si el token ha expirado', async () => {
      const expired = sign({ email: 'ana@example.com' }, { subject: '7', expiresIn: -10 });

      await expectUnauthorized(await get(`Bearer ${expired}`), 'El token ha expirado');
    });

    it.each([
      ['texto que no es un JWT', 'no-es-un-jwt'],
      ['JWT truncado', sign({ email: 'a@b.c' }, { subject: '1' }).slice(0, -5)],
      ['firmado con otro secreto', sign({ email: 'a@b.c' }, { subject: '1' }, 'otro-secreto-de-al-menos-32-caracteres')],
      ['algoritmo "none"', jwt.sign({ email: 'a@b.c', sub: '1' }, '', { algorithm: 'none' })],
      ['sin sub', sign({ email: 'a@b.c' })],
      ['sub no numérico', sign({ email: 'a@b.c' }, { subject: 'admin' })],
      ['sin email', sign({}, { subject: '1' })],
    ])('responde 401 con %s', async (_caso, token) => {
      await expectUnauthorized(await get(`Bearer ${token}`), 'Token inválido');
    });

    it('responde 401 si el payload no tiene la forma esperada', async () => {
      // Firma válida con algoritmo correcto, pero payload string en vez de objeto.
      const token = jwt.sign('solo-un-string', SECRET, { algorithm: 'HS256' });

      await expectUnauthorized(await get(`Bearer ${token}`), 'Token inválido');
    });
  });
});
