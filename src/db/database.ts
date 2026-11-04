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
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT    NOT NULL UNIQUE,
    original_url  TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    user_id       INTEGER REFERENCES users(id),
    click_count   INTEGER NOT NULL DEFAULT 0,
    last_click_at TEXT
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id     INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    clicked_at TEXT    NOT NULL,
    visitor    TEXT    NOT NULL,
    referrer   TEXT,
    device     TEXT    NOT NULL
  );

  -- Cubriente: las queries del dashboard leen device y visitor del propio índice,
  -- sin ir a la tabla por cada click.
  CREATE INDEX IF NOT EXISTS clicks_url_time ON clicks (url_id, clicked_at, device, visitor);
`;

// Contadores de urls mantenidos por SQLite en la misma transacción que el INSERT:
// los totales del dashboard no tienen que recorrer todos los clicks históricos.
// Los bots se guardan en clicks pero no cuentan.
const TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS clicks_count_url AFTER INSERT ON clicks
  WHEN NEW.device <> 'bot'
  BEGIN
    UPDATE urls
    SET click_count   = click_count + 1,
        last_click_at = max(coalesce(last_click_at, ''), NEW.clicked_at)
    WHERE id = NEW.url_id;
  END;
`;

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Bases creadas antes de existir la autenticación: urls no tenía user_id.
// Las filas antiguas quedan con user_id NULL (sin dueño: nadie puede borrarlas).
// Bases anteriores a las analíticas: urls no tenía los contadores de clicks.
function migrate(db: DatabaseSync): void {
  addColumnIfMissing(db, 'urls', 'user_id', 'INTEGER REFERENCES users(id)');
  addColumnIfMissing(db, 'urls', 'click_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'urls', 'last_click_at', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS urls_user_id ON urls (user_id)');
}

/** Abre la base de datos y crea o actualiza las tablas. En tests usa ':memory:'. */
export function createDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // SQLite no comprueba las claves foráneas salvo que se active en cada conexión.
  db.exec('PRAGMA foreign_keys = ON');
  // WAL: cada click es una escritura; sin WAL cada INSERT hace fsync (~300 clicks/s)
  // y lecturas y escrituras se bloquean entre sí. NORMAL es seguro en WAL: un corte
  // de luz puede perder las últimas transacciones, pero no corrompe la base.
  // En ':memory:' no aplica y SQLite lo ignora.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(SCHEMA);
  migrate(db);
  db.exec(TRIGGERS);
  return db;
}
