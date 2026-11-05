import { describe, expect, it } from 'vitest';
import { parseCreateUrl } from './validation.ts';

describe('parseCreateUrl', () => {
  it('acepta una URL http(s) y omite el alias vacío', () => {
    expect(parseCreateUrl({ url: '  https://example.com/a  ', alias: '  ' })).toEqual({
      ok: true,
      input: { url: 'https://example.com/a' },
    });
  });

  it('añade https:// si la URL no trae esquema', () => {
    expect(parseCreateUrl({ url: 'example.com/a?b=1', alias: '' })).toEqual({
      ok: true,
      input: { url: 'https://example.com/a?b=1' },
    });
  });

  it('incluye el alias válido', () => {
    expect(parseCreateUrl({ url: 'http://example.com', alias: 'Mi_Promo-26' })).toEqual({
      ok: true,
      input: { url: 'http://example.com', alias: 'Mi_Promo-26' },
    });
  });

  it.each([
    ['', 'Introduce la URL que quieres acortar'],
    ['javascript:alert(1)', 'Introduce una URL válida que empiece por http:// o https://'],
    ['ftp://example.com', 'Introduce una URL válida que empiece por http:// o https://'],
    ['https://', 'Introduce una URL válida que empiece por http:// o https://'],
    [`https://example.com/${'a'.repeat(2048)}`, 'La URL no puede superar los 2048 caracteres'],
  ])('rechaza la URL %j', (url, message) => {
    expect(parseCreateUrl({ url, alias: '' })).toEqual({ ok: false, errors: { url: message } });
  });

  it.each(['ab', 'a'.repeat(33), 'mi promo', 'mi/promo', 'promoción'])('rechaza el alias %j', (alias) => {
    expect(parseCreateUrl({ url: 'https://example.com', alias })).toEqual({
      ok: false,
      errors: { alias: 'Entre 3 y 32 caracteres: letras, números, "-" o "_"' },
    });
  });

  it.each(['health', 'Dashboard', 'AUTH', 'urls'])('rechaza el alias reservado %j', (alias) => {
    expect(parseCreateUrl({ url: 'https://example.com', alias })).toEqual({
      ok: false,
      errors: { alias: `"${alias}" está reservado, elige otro alias` },
    });
  });
});
