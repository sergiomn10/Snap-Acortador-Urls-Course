import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from './database.ts';

function columnsOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
}

describe('createDatabase', () => {
  it('crea las tablas users y urls', () => {
    const db = createDatabase(':memory:');

    expect(columnsOf(db, 'users')).toEqual(['id', 'email', 'password_hash', 'name', 'created_at']);
    expect(columnsOf(db, 'urls')).toEqual(['id', 'code', 'original_url', 'created_at', 'user_id']);
    db.close();
  });

  it('activa las claves foráneas', () => {
    const db = createDatabase(':memory:');

    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  describe('con una base anterior a la autenticación', () => {
    let dir: string;
    let path: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'snap-db-'));
      path = join(dir, 'antigua.db');

      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE urls (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          code         TEXT    NOT NULL UNIQUE,
          original_url TEXT    NOT NULL,
          created_at   TEXT    NOT NULL
        );
        INSERT INTO urls (code, original_url, created_at)
        VALUES ('abc1234', 'https://example.com', '2026-01-01T00:00:00.000Z');
      `);
      old.close();
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('añade user_id sin perder las URLs existentes, que quedan sin dueño', () => {
      const db = createDatabase(path);

      expect(columnsOf(db, 'urls')).toContain('user_id');
      expect(db.prepare('SELECT code, user_id FROM urls').all()).toEqual([
        { code: 'abc1234', user_id: null },
      ]);
      db.close();
    });

    it('se puede abrir varias veces sin fallar', () => {
      createDatabase(path).close();
      const db = createDatabase(path);

      expect(columnsOf(db, 'urls').filter((c) => c === 'user_id')).toHaveLength(1);
      db.close();
    });
  });
});
