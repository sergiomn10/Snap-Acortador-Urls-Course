import { createHmac } from 'node:crypto';

export type Device = 'mobile' | 'tablet' | 'desktop' | 'bot';

// Lista deliberadamente corta: crawlers y generadores de vistas previas de enlaces,
// que si no inflarían los clicks cada vez que alguien comparte la URL.
// curl/wget no se incluyen: son la forma habitual de probar Snap a mano.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|slack|preview|headless|lighthouse/i;
const TABLET_PATTERN = /ipad|tablet|android(?!.*mobile)/i;
const MOBILE_PATTERN = /mobi|iphone|ipod|android/i;

/** Clasificación aproximada por User-Agent. Sin User-Agent se asume un bot. */
export function classifyDevice(userAgent: string | undefined): Device {
  if (userAgent === undefined || userAgent.trim() === '') return 'bot';
  if (BOT_PATTERN.test(userAgent)) return 'bot';
  if (TABLET_PATTERN.test(userAgent)) return 'tablet';
  if (MOBILE_PATTERN.test(userAgent)) return 'mobile';
  return 'desktop';
}

/**
 * Solo el host del Referer: la ruta y la query pueden contener datos personales.
 * null = acceso directo o Referer no http(s).
 */
export function referrerHost(referer: string | undefined): string | null {
  if (referer === undefined || !URL.canParse(referer)) return null;
  const { protocol, hostname } = new URL(referer);
  return protocol === 'http:' || protocol === 'https:' ? hostname : null;
}

/**
 * Identificador estable del visitante sin guardar la IP: HMAC con un secreto, así no
 * se puede revertir probando todas las IPs sin conocerlo. Cambiar el secreto reinicia
 * el recuento de visitantes únicos.
 */
export function hashVisitor(ip: string, userAgent: string, secret: string): string {
  return createHmac('sha256', secret).update(`${ip}\n${userAgent}`).digest('hex');
}
