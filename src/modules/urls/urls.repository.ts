import { randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface ShortUrl {
  code: string;
  url: string;
  createdAt: string;
  /** null en URLs creadas antes de existir la autenticación. */
  userId: number | null;
}

/** URL con los contadores de clicks (sin bots) que mantiene el trigger de clicks. */
export interface UrlWithStats extends ShortUrl {
  clickCount: number;
  lastClickAt: string | null;
}

export interface UrlsRepository {
  /**
   * Usa `alias` como código si se indica; si no, genera uno aleatorio.
   * Lanza UnknownUserError si userId no corresponde a ningún usuario
   * y AliasTakenError si el alias ya existe.
   */
  create: (url: string, userId: number, alias?: string) => ShortUrl;
  findByCode: (code: string) => ShortUrl | undefined;
  list: () => ShortUrl[];
  /** URLs de un usuario con sus estadísticas, de la más reciente a la más antigua. */
  listByUser: (userId: number) => UrlWithStats[];
  /** Devuelve false si el código no existía. */
  remove: (code: string) => boolean;
}

/** El usuario no existe (p. ej. un JWT válido de un usuario de otra base de datos). */
export class UnknownUserError extends Error {
  constructor(userId: number) {
    super(`El usuario ${userId} no existe`);
    this.name = 'UnknownUserError';
  }
}

/** El alias pedido ya lo usa otra URL (alias o código generado). */
export class AliasTakenError extends Error {
  constructor(alias: string) {
    super(`El alias "${alias}" ya está en uso`);
    this.name = 'AliasTakenError';
  }
}

interface UrlRow {
  code: string;
  original_url: string;
  created_at: string;
  user_id: number | null;
}

interface UrlWithStatsRow extends UrlRow {
  click_count: number;
  last_click_at: string | null;
}

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const CODE_LENGTH = 7;

// 62^7 ≈ 3.5e12 combinaciones: una colisión es rarísima, varias seguidas indican un fallo.
const MAX_ATTEMPTS = 5;

const SQLITE_CONSTRAINT_FOREIGNKEY = 787;

/** Código aleatorio base62 generado con un CSPRNG para que no sea predecible. */
export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function toShortUrl(row: UrlRow): ShortUrl {
  return { code: row.code, url: row.original_url, createdAt: row.created_at, userId: row.user_id };
}

function isForeignKeyError(err: unknown): boolean {
  return (err as { errcode?: unknown } | null)?.errcode === SQLITE_CONSTRAINT_FOREIGNKEY;
}

export function createUrlsRepository(
  db: DatabaseSync,
  newCode: () => string = generateCode,
): UrlsRepository {
  // OR IGNORE: si el código ya existe no se inserta nada (changes === 0) y se reintenta.
  // No ignora las claves foráneas: un user_id inexistente sigue lanzando.
  const insert = db.prepare(
    'INSERT OR IGNORE INTO urls (code, original_url, created_at, user_id) VALUES (?, ?, ?, ?)',
  );
  const selectByCode = db.prepare(
    'SELECT code, original_url, created_at, user_id FROM urls WHERE code = ?',
  );
  const selectAll = db.prepare(
    'SELECT code, original_url, created_at, user_id FROM urls ORDER BY id DESC',
  );
  // Recorre el índice urls_user_id: el coste depende de las URLs del usuario, no de la tabla.
  const selectByUser = db.prepare(`
    SELECT code, original_url, created_at, user_id, click_count, last_click_at
    FROM urls
    WHERE user_id = ?
    ORDER BY id DESC
  `);
  const deleteByCode = db.prepare('DELETE FROM urls WHERE code = ?');

  /** Inserta con ese código; devuelve undefined si el código ya existía. */
  function tryInsert(code: string, url: string, userId: number): ShortUrl | undefined {
    const createdAt = new Date().toISOString();
    let changes: number | bigint;
    try {
      ({ changes } = insert.run(code, url, createdAt, userId));
    } catch (err) {
      if (isForeignKeyError(err)) throw new UnknownUserError(userId);
      throw err;
    }
    return changes === 1 ? { code, url, createdAt, userId } : undefined;
  }

  return {
    create(url, userId, alias) {
      if (alias !== undefined) {
        const created = tryInsert(alias, url, userId);
        if (created === undefined) throw new AliasTakenError(alias);
        return created;
      }

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const created = tryInsert(newCode(), url, userId);
        if (created !== undefined) return created;
      }
      throw new Error(`No se pudo generar un código único tras ${MAX_ATTEMPTS} intentos`);
    },

    findByCode(code) {
      const row = selectByCode.get(code) as UrlRow | undefined;
      return row && toShortUrl(row);
    },

    list() {
      return (selectAll.all() as unknown as UrlRow[]).map(toShortUrl);
    },

    listByUser(userId) {
      return (selectByUser.all(userId) as unknown as UrlWithStatsRow[]).map((row) => ({
        ...toShortUrl(row),
        clickCount: row.click_count,
        lastClickAt: row.last_click_at,
      }));
    },

    remove(code) {
      return deleteByCode.run(code).changes === 1;
    },
  };
}
