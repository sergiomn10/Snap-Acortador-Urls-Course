const LOCALE = 'es';

const numberFormat = new Intl.NumberFormat(LOCALE);
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const pctFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

export const formatNumber = (n: number): string => numberFormat.format(n);

export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));

export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

/** Variación porcentual con signo ("+20 %", "−5,5 %", "0 %"). */
export const formatChange = (pct: number): string => `${pctFormat.format(pct)} %`;

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "hace 3 horas", "ayer"… Por debajo de un minuto, "ahora mismo". */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'ahora mismo';
}
