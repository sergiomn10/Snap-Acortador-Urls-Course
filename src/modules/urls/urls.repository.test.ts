import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/database.ts';
import { CODE_LENGTH, createUrlsRepository, generateCode } from './urls.repository.ts';

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

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => db.close());

  it('guarda una URL y la recupera por su código', () => {
    const repository = createUrlsRepository(db);

    const created = repository.create('https://example.com/');

    expect(created.code).toHaveLength(CODE_LENGTH);
    expect(repository.findByCode(created.code)).toEqual(created);
  });

  it('devuelve undefined para un código inexistente', () => {
    expect(createUrlsRepository(db).findByCode('nada123')).toBeUndefined();
  });

  it('lista las URLs de la más reciente a la más antigua', () => {
    const repository = createUrlsRepository(db);
    const first = repository.create('https://example.com/1');
    const second = repository.create('https://example.com/2');

    expect(repository.list()).toEqual([second, first]);
  });

  it('reintenta con otro código si hay colisión', () => {
    const codes = ['aaaaaaa', 'aaaaaaa', 'bbbbbbb'];
    const repository = createUrlsRepository(db, () => codes.shift()!);

    repository.create('https://example.com/1');
    const second = repository.create('https://example.com/2');

    expect(second.code).toBe('bbbbbbb');
    expect(repository.findByCode('aaaaaaa')?.url).toBe('https://example.com/1');
  });

  it('falla si no consigue un código único', () => {
    const repository = createUrlsRepository(db, () => 'aaaaaaa');
    repository.create('https://example.com/1');

    expect(() => repository.create('https://example.com/2')).toThrow(/código único/);
  });
});
