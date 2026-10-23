import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS urls (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT    NOT NULL UNIQUE,
    original_url TEXT    NOT NULL,
    created_at   TEXT    NOT NULL
  );
`;

/** Abre la base de datos y crea las tablas si no existen. En tests usa ':memory:'. */
export function createDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}
