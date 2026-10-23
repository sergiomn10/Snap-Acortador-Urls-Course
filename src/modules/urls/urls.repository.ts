import { randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface ShortUrl {
  code: string;
  url: string;
  createdAt: string;
}

export interface UrlsRepository {
  create: (url: string) => ShortUrl;
  findByCode: (code: string) => ShortUrl | undefined;
  list: () => ShortUrl[];
}

interface UrlRow {
  code: string;
  original_url: string;
  created_at: string;
}

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const CODE_LENGTH = 7;

// 62^7 ≈ 3.5e12 combinaciones: una colisión es rarísima, varias seguidas indican un fallo.
const MAX_ATTEMPTS = 5;

/** Código aleatorio base62 generado con un CSPRNG para que no sea predecible. */
export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function toShortUrl(row: UrlRow): ShortUrl {
  return { code: row.code, url: row.original_url, createdAt: row.created_at };
}

export function createUrlsRepository(
  db: DatabaseSync,
  newCode: () => string = generateCode,
): UrlsRepository {
  // OR IGNORE: si el código ya existe no se inserta nada (changes === 0) y se reintenta.
  const insert = db.prepare(
    'INSERT OR IGNORE INTO urls (code, original_url, created_at) VALUES (?, ?, ?)',
  );
  const selectByCode = db.prepare(
    'SELECT code, original_url, created_at FROM urls WHERE code = ?',
  );
  const selectAll = db.prepare(
    'SELECT code, original_url, created_at FROM urls ORDER BY id DESC',
  );

  return {
    create(url) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = newCode();
        const createdAt = new Date().toISOString();
        if (insert.run(code, url, createdAt).changes === 1) {
          return { code, url, createdAt };
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
  };
}
