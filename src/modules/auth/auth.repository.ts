import type { DatabaseSync } from 'node:sqlite';

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  name: string;
}

export interface UsersRepository {
  /** Devuelve undefined si el email ya está registrado. */
  create: (user: NewUser) => User | undefined;
  findByEmail: (email: string) => User | undefined;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function createUsersRepository(db: DatabaseSync): UsersRepository {
  // OR IGNORE: un email duplicado no lanza, deja changes === 0. Es atómico, sin carreras
  // entre comprobar y reservar el email.
  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)',
  );
  const selectByEmail = db.prepare(
    'SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?',
  );

  return {
    create({ email, passwordHash, name }) {
      const createdAt = new Date().toISOString();
      const result = insert.run(email, passwordHash, name, createdAt);
      if (result.changes === 0) return undefined;
      return { id: Number(result.lastInsertRowid), email, passwordHash, name, createdAt };
    },

    findByEmail(email) {
      const row = selectByEmail.get(email) as UserRow | undefined;
      return row && toUser(row);
    },
  };
}
