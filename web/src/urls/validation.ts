import type { CreateUrlInput } from '../api/types.ts';
import type { FieldErrors } from '../auth/validation.ts';

// Mismas reglas que src/modules/urls/urls.routes.ts del backend.
export const MAX_URL_LENGTH = 2048;
export const MIN_ALIAS_LENGTH = 3;
export const MAX_ALIAS_LENGTH = 32;
const ALIAS_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${MIN_ALIAS_LENGTH},${MAX_ALIAS_LENGTH}}$`);
const RESERVED_ALIASES = ['auth', 'dashboard', 'health', 'urls'];

export type UrlField = 'url' | 'alias';

export type ParseResult = { ok: true; input: CreateUrlInput } | { ok: false; errors: FieldErrors<UrlField> };

/**
 * Valida el formulario y devuelve lo que se envía a la API o los errores por campo.
 * Si la URL no trae esquema ("example.com/x") se asume https://, como hacen los navegadores.
 */
export function parseCreateUrl(raw: { url: string; alias: string }): ParseResult {
  const errors: FieldErrors<UrlField> = {};

  let url = raw.url.trim();
  if (url === '') {
    errors.url = 'Introduce la URL que quieres acortar';
  } else {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
    const protocol = URL.canParse(url) ? new URL(url).protocol : undefined;
    if (protocol !== 'http:' && protocol !== 'https:') {
      errors.url = 'Introduce una URL válida que empiece por http:// o https://';
    } else if (url.length > MAX_URL_LENGTH) {
      errors.url = `La URL no puede superar los ${MAX_URL_LENGTH} caracteres`;
    }
  }

  const alias = raw.alias.trim();
  if (alias !== '' && !ALIAS_PATTERN.test(alias)) {
    errors.alias = `Entre ${MIN_ALIAS_LENGTH} y ${MAX_ALIAS_LENGTH} caracteres: letras, números, "-" o "_"`;
  } else if (RESERVED_ALIASES.includes(alias.toLowerCase())) {
    errors.alias = `"${alias}" está reservado, elige otro alias`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: alias === '' ? { url } : { url, alias } };
}
