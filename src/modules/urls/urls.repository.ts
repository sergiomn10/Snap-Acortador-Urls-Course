import { randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface ShortUrl {
  code: string;
  url: string;
  createdAt: string;
  /** null en URLs creadas antes de existir la autenticación. */
  userId: number | null;
}

export interface UrlsRepository {
  /** Lanza UnknownUserError si userId no corresponde a ningún usuario. */
  create: (url: string, userId: number) => ShortUrl;
  findByCode: (code: string) => ShortUrl | undefined;
  list: () => ShortUrl[];
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

interface UrlRow {
  code: string;
  original_url: string;
  created_at: string;
  user_id: number | null;
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
  const deleteByCode = db.prepare('DELETE FROM urls WHERE code = ?');

  return {
    create(url, userId) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = newCode();
        const createdAt = new Date().toISOString();
        let changes: number | bigint;
        try {
          ({ changes } = insert.run(code, url, createdAt, userId));
        } catch (err) {
          if (isForeignKeyError(err)) throw new UnknownUserError(userId);
          throw err;
        }
        if (changes === 1) {
          return { code, url, createdAt, userId };
        }
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

    remove(code) {
      return deleteByCode.run(code).changes === 1;
    },
  };
}
