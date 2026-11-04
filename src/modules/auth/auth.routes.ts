import { Router, type Response } from 'express';
import { AuthError, type AuthErrorCode, type AuthService, type LoginInput, type RegisterInput } from './auth.service.ts';

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignora todo lo que pase de 72 bytes: se rechaza para no aceptar passwords
// que en realidad se truncan sin avisar.
export const MAX_PASSWORD_BYTES = 72;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

// Validación deliberadamente simple: la única prueba real de un email es enviarle algo.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTH_ERROR_STATUS: Record<AuthErrorCode, { status: number; error: string }> = {
  EMAIL_TAKEN: { status: 409, error: 'Conflict' },
  INVALID_CREDENTIALS: { status: 401, error: 'Unauthorized' },
};

type Body = Record<string, unknown>;

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: 'Bad Request', message });
}

function validateEmail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return 'El campo "email" es obligatorio';
  const email = value.trim();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'El campo "email" no es un email válido';
  }
  return undefined;
}

/** Devuelve los datos validados o el mensaje del primer error encontrado. */
function parseRegister(body: Body): RegisterInput | string {
  const { email, password, name } = body;

  const emailError = validateEmail(email);
  if (emailError !== undefined) return emailError;

  if (typeof password !== 'string') return 'El campo "password" es obligatorio';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `El password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `El password no puede superar los ${MAX_PASSWORD_BYTES} bytes`;
  }

  if (typeof name !== 'string' || name.trim() === '') return 'El campo "name" es obligatorio';
  if (name.trim().length > MAX_NAME_LENGTH) {
    return `El nombre no puede superar los ${MAX_NAME_LENGTH} caracteres`;
  }

  return { email: email as string, password, name: name.trim() };
}

// En login no se aplica la política de longitud: si cambia, los usuarios antiguos
// deben poder seguir entrando. Un password que no coincide da 401 sin más.
function parseLogin(body: Body): LoginInput | string {
  const { email, password } = body;

  const emailError = validateEmail(email);
  if (emailError !== undefined) return emailError;
  if (typeof password !== 'string' || password === '') return 'El campo "password" es obligatorio';

  return { email: email as string, password };
}

/** Rutas de autenticación, montadas en /auth. */
export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  // Traduce los errores de dominio a HTTP; cualquier otro llega al errorHandler (500).
  async function respond(res: Response, status: number, action: () => ReturnType<AuthService['login']>) {
    try {
      const { user, token } = await action();
      res.status(status).json({ user, token });
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      const { status: errorStatus, error } = AUTH_ERROR_STATUS[err.code];
      res.status(errorStatus).json({ error, message: err.message });
    }
  }

  router.post('/register', async (req, res) => {
    const input = parseRegister((req.body ?? {}) as Body);
    if (typeof input === 'string') {
      badRequest(res, input);
      return;
    }
    await respond(res, 201, () => authService.register(input));
  });

  router.post('/login', async (req, res) => {
    const input = parseLogin((req.body ?? {}) as Body);
    if (typeof input === 'string') {
      badRequest(res, input);
      return;
    }
    await respond(res, 200, () => authService.login(input));
  });

  return router;
}
