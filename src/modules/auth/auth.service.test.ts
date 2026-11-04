import type { DatabaseSync } from 'node:sqlite';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/database.ts';
import { createUsersRepository } from './auth.repository.ts';
import { AuthError, createAuthService, type AuthService } from './auth.service.ts';

const SECRET = 'test-secret-de-al-menos-32-caracteres';
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

const ANA = { email: 'ana@example.com', password: 'contraseña-segura', name: 'Ana' };

function decode(token: string): JwtPayload {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as JwtPayload;
}

describe('createAuthService', () => {
  let db: DatabaseSync;
  let auth: AuthService;

  beforeEach(() => {
    db = createDatabase(':memory:');
    // saltRounds mínimo: bcrypt es lento a propósito y los tests no necesitan seguridad.
    auth = createAuthService({ users: createUsersRepository(db), jwtSecret: SECRET, saltRounds: 4 });
  });

  afterEach(() => db.close());

  describe('register', () => {
    it('registra al usuario y devuelve un JWT válido que expira en 24 horas', async () => {
      const { token, user } = await auth.register(ANA);

      expect(user).toEqual({
        id: expect.any(Number),
        email: 'ana@example.com',
        name: 'Ana',
        createdAt: expect.any(String),
      });

      const payload = decode(token);
      expect(payload.sub).toBe(String(user.id));
      expect(payload.email).toBe('ana@example.com');
      expect(payload.exp! - payload.iat!).toBe(ONE_DAY_IN_SECONDS);
    });

    it('guarda el password hasheado, nunca en claro', async () => {
      await auth.register(ANA);

      const row = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
      expect(row.password_hash).not.toBe(ANA.password);
      expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    });

    it('normaliza el email a minúsculas', async () => {
      const { user } = await auth.register({ ...ANA, email: '  Ana@Example.COM ' });

      expect(user.email).toBe('ana@example.com');
    });

    it('falla si el email ya está registrado', async () => {
      await auth.register(ANA);

      await expect(auth.register({ ...ANA, name: 'Otra Ana' })).rejects.toMatchObject({
        name: 'AuthError',
        code: 'EMAIL_TAKEN',
      });
    });

    it('falla si el email ya existe con otras mayúsculas', async () => {
      await auth.register(ANA);

      await expect(auth.register({ ...ANA, email: 'ANA@EXAMPLE.COM' })).rejects.toThrow(AuthError);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await auth.register(ANA);
    });

    it('devuelve un JWT con credenciales correctas', async () => {
      const { token, user } = await auth.login({ email: ANA.email, password: ANA.password });

      expect(user.email).toBe('ana@example.com');
      expect(decode(token).sub).toBe(String(user.id));
    });

    it('funciona con el email en mayúsculas', async () => {
      const { user } = await auth.login({ email: 'ANA@EXAMPLE.COM', password: ANA.password });

      expect(user.email).toBe('ana@example.com');
    });

    it('falla con un password incorrecto', async () => {
      await expect(auth.login({ email: ANA.email, password: 'incorrecta' })).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('falla con un email inexistente', async () => {
      await expect(
        auth.login({ email: 'nadie@example.com', password: ANA.password }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('da el mismo error para email inexistente y password incorrecto', async () => {
      const wrongPassword = await auth.login({ email: ANA.email, password: 'x' }).catch((e) => e);
      const unknownEmail = await auth.login({ email: 'nadie@example.com', password: 'x' }).catch((e) => e);

      expect(unknownEmail).toEqual(wrongPassword);
      expect((unknownEmail as Error).message).toBe('Email o password incorrectos');
    });

    it('nunca expone el hash del password', async () => {
      const result = await auth.login({ email: ANA.email, password: ANA.password });

      expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$|passwordHash/);
    });
  });
});
