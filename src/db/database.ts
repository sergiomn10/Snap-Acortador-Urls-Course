import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS urls (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT    NOT NULL UNIQUE,
    original_url TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    user_id      INTEGER REFERENCES users(id)
  );
`;

// Bases creadas antes de existir la autenticación: urls no tenía user_id.
// Las filas antiguas quedan con user_id NULL (sin dueño: nadie puede borrarlas).
function migrate(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(urls)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'user_id')) {
    db.exec('ALTER TABLE urls ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }
  db.exec('CREATE INDEX IF NOT EXISTS urls_user_id ON urls (user_id)');
}

/** Abre la base de datos y crea o actualiza las tablas. En tests usa ':memory:'. */
export function createDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // SQLite no comprueba las claves foráneas salvo que se active en cada conexión.
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
