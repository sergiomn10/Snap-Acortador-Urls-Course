import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UsersRepository } from './auth.repository.ts';

export const TOKEN_EXPIRES_IN = '24h';
const DEFAULT_SALT_ROUNDS = 12;

export type AuthErrorCode = 'EMAIL_TAKEN' | 'INVALID_CREDENTIALS';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Usuario sin el hash del password: lo único que puede salir del servicio. */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface AuthService {
  register: (input: RegisterInput) => Promise<AuthResult>;
  login: (input: LoginInput) => Promise<AuthResult>;
}

interface AuthServiceOptions {
  users: UsersRepository;
  jwtSecret: string;
  /** Coste de bcrypt. Solo se baja en tests, para que vayan rápido. */
  saltRounds?: number | undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser({ id, email, name, createdAt }: User): PublicUser {
  return { id, email, name, createdAt };
}

export function createAuthService({
  users,
  jwtSecret,
  saltRounds = DEFAULT_SALT_ROUNDS,
}: AuthServiceOptions): AuthService {
  // Si el email no existe se compara contra este hash igualmente, para que el login tarde
  // lo mismo en ambos casos y no se pueda averiguar qué emails están registrados.
  // Se calcula en el primer uso para no bloquear el arranque.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () => (dummyHash ??= bcrypt.hash('snap-dummy-password', saltRounds));

  function issueToken(user: User): AuthResult {
    const token = jwt.sign({ email: user.email }, jwtSecret, {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: TOKEN_EXPIRES_IN,
    });
    return { token, user: toPublicUser(user) };
  }

  return {
    async register({ email, password, name }) {
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const user = users.create({ email: normalizeEmail(email), passwordHash, name });
      if (user === undefined) {
        throw new AuthError('EMAIL_TAKEN', 'El email ya está registrado');
      }
      return issueToken(user);
    },

    async login({ email, password }) {
      const user = users.findByEmail(normalizeEmail(email));
      const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
      // Mismo error para email inexistente y password incorrecto: no revela cuál falló.
      if (user === undefined || !valid) {
        throw new AuthError('INVALID_CREDENTIALS', 'Email o password incorrectos');
      }
      return issueToken(user);
    },
  };
}
