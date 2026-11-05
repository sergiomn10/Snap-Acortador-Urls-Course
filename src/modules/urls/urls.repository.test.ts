import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/database.ts';
import { createUsersRepository } from '../auth/auth.repository.ts';
import {
  AliasTakenError,
  CODE_LENGTH,
  createUrlsRepository,
  generateCode,
  UnknownUserError,
} from './urls.repository.ts';

describe('generateCode', () => {
  it('genera códigos base62 de la longitud esperada', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCode()).toMatch(new RegExp(`^[A-Za-z0-9]{${CODE_LENGTH}}$`));
    }
  });

  it('no repite códigos en una muestra amplia', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateCode));
    expect(codes.size).toBe(1000);
  });
});

describe('createUrlsRepository', () => {
  let db: DatabaseSync;
  let userId: number;

  beforeEach(() => {
    db = createDatabase(':memory:');
    // urls.user_id es clave foránea: hace falta un usuario real.
    userId = createUsersRepository(db).create({
      email: 'ana@example.com',
      passwordHash: 'hash',
      name: 'Ana',
    })!.id;
  });

  afterEach(() => db.close());

  it('guarda una URL asociada a su usuario y la recupera por su código', () => {
    const repository = createUrlsRepository(db);

    const created = repository.create('https://example.com/', userId);

    expect(created.code).toHaveLength(CODE_LENGTH);
    expect(created.userId).toBe(userId);
    expect(repository.findByCode(created.code)).toEqual(created);
  });

  it('devuelve undefined para un código inexistente', () => {
    expect(createUrlsRepository(db).findByCode('nada123')).toBeUndefined();
  });

  it('lista las URLs de la más reciente a la más antigua', () => {
    const repository = createUrlsRepository(db);
    const first = repository.create('https://example.com/1', userId);
    const second = repository.create('https://example.com/2', userId);

    expect(repository.list()).toEqual([second, first]);
  });

  it('reintenta con otro código si hay colisión', () => {
    const codes = ['aaaaaaa', 'aaaaaaa', 'bbbbbbb'];
    const repository = createUrlsRepository(db, () => codes.shift()!);

    repository.create('https://example.com/1', userId);
    const second = repository.create('https://example.com/2', userId);

    expect(second.code).toBe('bbbbbbb');
    expect(repository.findByCode('aaaaaaa')?.url).toBe('https://example.com/1');
  });

  it('falla si no consigue un código único', () => {
    const repository = createUrlsRepository(db, () => 'aaaaaaa');
    repository.create('https://example.com/1', userId);

    expect(() => repository.create('https://example.com/2', userId)).toThrow(/código único/);
  });

  it('lanza UnknownUserError si el usuario no existe', () => {
    const repository = createUrlsRepository(db);

    expect(() => repository.create('https://example.com/', 999)).toThrow(UnknownUserError);
    expect(repository.list()).toEqual([]);
  });

  describe('create con alias', () => {
    it('usa el alias como código', () => {
      const repository = createUrlsRepository(db);

      const created = repository.create('https://example.com/', userId, 'mi-promo');

      expect(created.code).toBe('mi-promo');
      expect(repository.findByCode('mi-promo')).toEqual(created);
    });

    it('lanza AliasTakenError si el alias ya existe, sin reintentar con otro código', () => {
      const repository = createUrlsRepository(db);
      repository.create('https://example.com/1', userId, 'mi-promo');

      expect(() => repository.create('https://example.com/2', userId, 'mi-promo')).toThrow(AliasTakenError);
      expect(repository.findByCode('mi-promo')?.url).toBe('https://example.com/1');
      expect(repository.list()).toHaveLength(1);
    });

    it('choca también con un código generado', () => {
      const repository = createUrlsRepository(db, () => 'aaaaaaa');
      repository.create('https://example.com/1', userId);

      expect(() => repository.create('https://example.com/2', userId, 'aaaaaaa')).toThrow(AliasTakenError);
    });

    it('lanza UnknownUserError antes que AliasTakenError si el usuario no existe', () => {
      expect(() => createUrlsRepository(db).create('https://example.com/', 999, 'mi-promo')).toThrow(
        UnknownUserError,
      );
    });
  });

  describe('listByUser', () => {
    it('devuelve solo las URLs del usuario, de la más reciente a la más antigua, con sus contadores', () => {
      const repository = createUrlsRepository(db);
      const otherId = createUsersRepository(db).create({
        email: 'bea@example.com',
        passwordHash: 'hash',
        name: 'Bea',
      })!.id;
      const first = repository.create('https://example.com/1', userId);
      repository.create('https://example.com/bea', otherId);
      const second = repository.create('https://example.com/2', userId);
      db.prepare("UPDATE urls SET click_count = 3, last_click_at = '2026-11-05T10:00:00.000Z' WHERE code = ?").run(
        first.code,
      );

      expect(repository.listByUser(userId)).toEqual([
        { ...second, clickCount: 0, lastClickAt: null },
        { ...first, clickCount: 3, lastClickAt: '2026-11-05T10:00:00.000Z' },
      ]);
    });

    it('devuelve una lista vacía si el usuario no tiene URLs', () => {
      expect(createUrlsRepository(db).listByUser(userId)).toEqual([]);
    });
  });

  describe('remove', () => {
    it('borra la URL y devuelve true', () => {
      const repository = createUrlsRepository(db);
      const { code } = repository.create('https://example.com/', userId);

      expect(repository.remove(code)).toBe(true);
      expect(repository.findByCode(code)).toBeUndefined();
    });

    it('devuelve false si el código no existe', () => {
      expect(createUrlsRepository(db).remove('nada123')).toBe(false);
    });
  });
});
