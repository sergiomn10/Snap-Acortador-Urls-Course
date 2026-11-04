import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createDatabase } from '../../db/database.ts';
import { listen, type TestServer } from '../../testing/listen.ts';
import type { Dashboard } from './dashboard.service.ts';

interface Session {
  token: string;
}

// Todas las peticiones de los tests salen de 127.0.0.1: el User-Agent distingue a
// los visitantes (el hash de visitante combina IP y User-Agent).
const VISITOR = {
  v1: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
  v2: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148',
  v3: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

// "Hoy" en los tests. Con days=30 el periodo es [2026-10-06, 2026-11-04] y el
// anterior [2026-09-06, 2026-10-05].
const TODAY = new Date('2026-11-04T23:00:00.000Z');

describe('módulo dashboard', () => {
  let db: DatabaseSync;
  let server: TestServer;
  let clock = TODAY;
  let ana: Session;
  let bea: Session;
  let carla: Session;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    server = await listen(createApp({ db, saltRounds: 4, now: () => clock }));
    ana = await register('ana@example.com');
    bea = await register('bea@example.com');
    carla = await register('carla@example.com');
  });

  afterAll(async () => {
    await server.close();
    db.close();
  });

  async function register(email: string): Promise<Session> {
    const res = await fetch(`${server.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'contraseña-segura', name: email }),
    });
    const { token } = (await res.json()) as { token: string };
    return { token };
  }

  async function createUrl(url: string, session: Session): Promise<string> {
    const res = await fetch(`${server.baseUrl}/urls`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ url }),
    });
    return ((await res.json()) as { code: string }).code;
  }

  /** Visita real a la redirección, con el reloj de la app en `at`. */
  async function visit(code: string, at: string, userAgent: string, method = 'GET'): Promise<void> {
    clock = new Date(at);
    const res = await fetch(`${server.baseUrl}/${code}`, {
      method,
      redirect: 'manual',
      headers: { 'user-agent': userAgent },
    });
    expect(res.status).toBe(302);
    clock = TODAY;
  }

  function getDashboard(session: Session | null, query = ''): Promise<Response> {
    return fetch(`${server.baseUrl}/dashboard${query}`, {
      headers: session ? { authorization: `Bearer ${session.token}` } : {},
    });
  }

  async function dashboardOf(session: Session, query = ''): Promise<Dashboard> {
    const res = await getDashboard(session, query);
    expect(res.status).toBe(200);
    return (await res.json()) as Dashboard;
  }

  describe('autenticación', () => {
    it('responde 401 sin token', async () => {
      const res = await getDashboard(null);

      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
      expect(await res.json()).toEqual({
        error: 'Unauthorized',
        message: 'Falta el token de autenticación',
      });
    });

    it('responde 401 con un token inválido', async () => {
      const res = await getDashboard({ token: 'no-es-un-jwt' });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'Token inválido' });
    });

    it('comprueba la autenticación antes que los parámetros', async () => {
      const res = await getDashboard(null, '?days=abc');

      expect(res.status).toBe(401);
    });
  });

  describe('usuario sin URLs', () => {
    it('devuelve todo a cero, con un día por elemento del periodo', async () => {
      const dashboard = await dashboardOf(carla);

      expect(dashboard.period).toEqual({
        days: 30,
        from: '2026-10-06',
        to: '2026-11-04',
        timezone: 'UTC',
      });
      expect(dashboard.totals).toEqual({ urls: 0, clicks: 0, urlsWithClicks: 0, lastClickAt: null });
      expect(dashboard.trend).toEqual({
        clicks: 0,
        previousClicks: 0,
        changePct: null,
        uniqueVisitors: 0,
      });
      expect(dashboard.daily).toHaveLength(30);
      expect(dashboard.daily[0]?.date).toBe('2026-10-06');
      expect(dashboard.daily.at(-1)?.date).toBe('2026-11-04');
      expect(dashboard.daily.every((d) => d.clicks === 0 && d.uniqueVisitors === 0)).toBe(true);
    });
  });

  describe('usuario con URLs y clicks', () => {
    beforeAll(async () => {
      const a = await createUrl('https://example.com/a', ana);
      const b = await createUrl('https://example.com/b', ana);
      await createUrl('https://example.com/sin-clicks', ana);
      const deBea = await createUrl('https://example.com/bea', bea);

      // Periodo actual: 5 clicks de 3 visitantes.
      await visit(a, '2026-11-04T09:00:00.000Z', VISITOR.v1);
      await visit(a, '2026-11-04T10:00:00.000Z', VISITOR.v1);
      await visit(a, '2026-11-04T11:30:00.000Z', VISITOR.v2);
      await visit(b, '2026-10-20T15:00:00.000Z', VISITOR.v3);
      await visit(a, '2026-10-06T00:00:00.000Z', VISITOR.v1); // primer instante del periodo
      // Periodo anterior: 2 clicks.
      await visit(b, '2026-10-05T23:59:59.999Z', VISITOR.v1); // último instante del anterior
      await visit(b, '2026-09-06T00:00:00.000Z', VISITOR.v2);
      // Fuera de ambos periodos: solo cuenta en los totales.
      await visit(b, '2026-08-01T12:00:00.000Z', VISITOR.v3);
      // No cuentan: un bot y una petición HEAD.
      await visit(a, '2026-11-04T12:00:00.000Z', VISITOR.bot);
      await visit(a, '2026-11-04T12:00:00.000Z', VISITOR.v1, 'HEAD');
      // Clicks de otro usuario: no deben aparecer en el dashboard de Ana.
      for (let i = 0; i < 4; i++) await visit(deBea, '2026-11-04T13:00:00.000Z', VISITOR.v1);
    });

    it('devuelve los totales históricos', async () => {
      const { totals } = await dashboardOf(ana);

      expect(totals).toEqual({
        urls: 3,
        clicks: 8,
        urlsWithClicks: 2,
        lastClickAt: '2026-11-04T11:30:00.000Z',
      });
    });

    it('compara el periodo actual con el anterior', async () => {
      const { trend } = await dashboardOf(ana);

      expect(trend).toEqual({
        clicks: 5,
        previousClicks: 2,
        changePct: 150,
        uniqueVisitors: 3,
      });
    });

    it('devuelve la serie diaria con los días sin clicks a cero', async () => {
      const { daily } = await dashboardOf(ana);

      expect(daily).toHaveLength(30);
      expect(daily.filter((d) => d.clicks > 0)).toEqual([
        { date: '2026-10-06', clicks: 1, uniqueVisitors: 1 },
        { date: '2026-10-20', clicks: 1, uniqueVisitors: 1 },
        { date: '2026-11-04', clicks: 3, uniqueVisitors: 2 },
      ]);
    });

    it('acota tendencia y serie al periodo pedido con ?days=7', async () => {
      const dashboard = await dashboardOf(ana, '?days=7');

      expect(dashboard.period).toEqual({
        days: 7,
        from: '2026-10-29',
        to: '2026-11-04',
        timezone: 'UTC',
      });
      // El periodo anterior (22–28 oct) no tiene clicks: no hay base para el porcentaje.
      expect(dashboard.trend).toEqual({
        clicks: 3,
        previousClicks: 0,
        changePct: null,
        uniqueVisitors: 2,
      });
      expect(dashboard.daily).toHaveLength(7);
      // Los totales no dependen del periodo.
      expect(dashboard.totals.clicks).toBe(8);
    });

    it('solo incluye las URLs del usuario autenticado', async () => {
      const dashboard = await dashboardOf(bea);

      expect(dashboard.totals).toEqual({
        urls: 1,
        clicks: 4,
        urlsWithClicks: 1,
        lastClickAt: '2026-11-04T13:00:00.000Z',
      });
      expect(dashboard.trend.clicks).toBe(4);
      expect(dashboard.trend.uniqueVisitors).toBe(1);
    });
  });

  describe('parámetro days', () => {
    it.each(['14', 'abc', '', '30.0'])('responde 400 con days=%j', async (days) => {
      const res = await getDashboard(ana, `?days=${days}`);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Bad Request',
        message: 'El parámetro "days" debe ser 7, 30 o 90',
      });
    });

    it('responde 400 si days se repite', async () => {
      const res = await getDashboard(ana, '?days=7&days=30');

      expect(res.status).toBe(400);
    });

    it('acepta days=90', async () => {
      const dashboard = await dashboardOf(ana, '?days=90');

      expect(dashboard.daily).toHaveLength(90);
      expect(dashboard.trend.clicks).toBe(7);
    });
  });
});
