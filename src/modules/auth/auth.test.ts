import type { DatabaseSync } from 'node:sqlite';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { config } from '../../config.ts';
import { createDatabase } from '../../db/database.ts';
import { listen, type TestServer } from '../../testing/listen.ts';

interface AuthBody {
  user: { id: number; email: string; name: string; createdAt: string };
  token: string;
}

interface ErrorBody {
  error: string;
  message: string;
}

const ANA = { email: 'ana@example.com', password: 'contraseña-segura', name: 'Ana' };

describe('módulo auth', () => {
  let db: DatabaseSync;
  let server: TestServer;

  // Base y servidor nuevos en cada test: los registros de uno no afectan a otro.
  beforeEach(async () => {
    db = createDatabase(':memory:');
    server = await listen(createApp({ db, saltRounds: 4 }));
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${server.baseUrl}/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function expectError(res: Response, status: number, message: RegExp): Promise<void> {
    expect(res.status).toBe(status);
    const body = (await res.json()) as ErrorBody;
    expect(body.message).toMatch(message);
  }

  describe('POST /auth/register', () => {
    it('responde 201 con el usuario y un token válido', async () => {
      const res = await post('register', ANA);

      expect(res.status).toBe(201);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      const body = (await res.json()) as AuthBody;
      expect(body.user).toEqual({
        id: expect.any(Number),
        email: 'ana@example.com',
        name: 'Ana',
        createdAt: expect.any(String),
      });

      const payload = jwt.verify(body.token, config.jwtSecret) as JwtPayload;
      expect(payload.sub).toBe(String(body.user.id));
    });

    it('normaliza el email y recorta el nombre', async () => {
      const res = await post('register', { ...ANA, email: ' Ana@Example.COM ', name: '  Ana  ' });

      const { user } = (await res.json()) as AuthBody;
      expect(user.email).toBe('ana@example.com');
      expect(user.name).toBe('Ana');
    });

    it('nunca devuelve el hash del password', async () => {
      const text = await (await post('register', ANA)).text();

      expect(text).not.toMatch(/password|\$2[aby]\$/i);
    });

    it('responde 409 si el email ya está registrado', async () => {
      await post('register', ANA);

      const res = await post('register', { ...ANA, email: 'ANA@example.com' });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Conflict', message: 'El email ya está registrado' });
    });

    it.each([
      ['sin email', { password: ANA.password, name: ANA.name }, /"email" es obligatorio/],
      ['email no string', { ...ANA, email: 42 }, /"email" es obligatorio/],
      ['email sin @', { ...ANA, email: 'ana.example.com' }, /no es un email válido/],
      ['email sin dominio', { ...ANA, email: 'ana@' }, /no es un email válido/],
      ['email con espacios', { ...ANA, email: 'ana maria@example.com' }, /no es un email válido/],
      ['sin password', { email: ANA.email, name: ANA.name }, /"password" es obligatorio/],
      ['password corto', { ...ANA, password: '1234567' }, /al menos 8 caracteres/],
      ['password de más de 72 bytes', { ...ANA, password: 'ñ'.repeat(37) }, /72 bytes/],
      ['sin nombre', { email: ANA.email, password: ANA.password }, /"name" es obligatorio/],
      ['nombre en blanco', { ...ANA, name: '   ' }, /"name" es obligatorio/],
      ['nombre demasiado largo', { ...ANA, name: 'a'.repeat(101) }, /100 caracteres/],
    ])('responde 400 con %s', async (_caso, body, message) => {
      const res = await post('register', body);

      await expectError(res, 400, message);
    });

    it('acepta un password de exactamente 8 caracteres', async () => {
      const res = await post('register', { ...ANA, password: '12345678' });

      expect(res.status).toBe(201);
    });

    it('responde 400 sin body', async () => {
      const res = await fetch(`${server.baseUrl}/auth/register`, { method: 'POST' });

      expect(res.status).toBe(400);
    });

    it('responde 400 con JSON malformado', async () => {
      const res = await fetch(`${server.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{malformado',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await post('register', ANA);
    });

    it('responde 200 con el usuario y un token válido', async () => {
      const res = await post('login', { email: ANA.email, password: ANA.password });

      expect(res.status).toBe(200);
      const body = (await res.json()) as AuthBody;
      expect(body.user.email).toBe('ana@example.com');
      expect(body.user.name).toBe('Ana');

      const payload = jwt.verify(body.token, config.jwtSecret) as JwtPayload;
      expect(payload.sub).toBe(String(body.user.id));
      expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);
    });

    it('acepta el email en mayúsculas', async () => {
      const res = await post('login', { email: 'ANA@EXAMPLE.COM', password: ANA.password });

      expect(res.status).toBe(200);
    });

    it('responde 401 con un password incorrecto', async () => {
      const res = await post('login', { email: ANA.email, password: 'incorrecta' });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: 'Unauthorized',
        message: 'Email o password incorrectos',
      });
    });

    it('responde 401 con un email inexistente', async () => {
      const res = await post('login', { email: 'nadie@example.com', password: ANA.password });

      expect(res.status).toBe(401);
    });

    it('da la misma respuesta para email inexistente y password incorrecto', async () => {
      const wrongPassword = await (await post('login', { email: ANA.email, password: 'x' })).json();
      const unknownEmail = await (await post('login', { email: 'nadie@x.com', password: 'x' })).json();

      expect(unknownEmail).toEqual(wrongPassword);
    });

    it.each([
      ['sin email', { password: ANA.password }, /"email" es obligatorio/],
      ['email inválido', { email: 'no-es-email', password: ANA.password }, /no es un email válido/],
      ['sin password', { email: ANA.email }, /"password" es obligatorio/],
      ['password vacío', { email: ANA.email, password: '' }, /"password" es obligatorio/],
    ])('responde 400 con %s', async (_caso, body, message) => {
      const res = await post('login', body);

      await expectError(res, 400, message);
    });
  });
});
