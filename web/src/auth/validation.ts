// Mismas reglas que src/modules/auth/auth.routes.ts del backend. Se comprueban aquí para
// avisar sin esperar al servidor, pero la validación que cuenta sigue siendo la de la API.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 100;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (email === '') return 'Introduce tu email';
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return 'El email no es válido';
  return undefined;
}

function compact<K extends string>(errors: Record<K, string | undefined>): FieldErrors<K> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v !== undefined)) as FieldErrors<K>;
}

export function validateLogin(input: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  return compact({
    email: validateEmail(input.email),
    password: input.password === '' ? 'Introduce tu password' : undefined,
  });
}

export function validateRegister(input: {
  email: string;
  password: string;
  name: string;
}): FieldErrors<'email' | 'password' | 'name'> {
  let password: string | undefined;
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    password = `El password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  } else if (new TextEncoder().encode(input.password).length > MAX_PASSWORD_BYTES) {
    password = `El password no puede superar los ${MAX_PASSWORD_BYTES} bytes`;
  }

  let name: string | undefined;
  if (input.name.trim() === '') name = 'Introduce tu nombre';
  else if (input.name.trim().length > MAX_NAME_LENGTH) {
    name = `El nombre no puede superar los ${MAX_NAME_LENGTH} caracteres`;
  }

  return compact({ email: validateEmail(input.email), password, name });
}
