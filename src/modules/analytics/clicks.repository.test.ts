import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/database.ts';
import { createUsersRepository } from '../auth/auth.repository.ts';
import { createUrlsRepository } from '../urls/urls.repository.ts';
import type { Click } from './clicks.repository.ts';
import { createClicksRepository } from './clicks.repository.ts';

function click(clickedAt: string, overrides: Partial<Click> = {}): Click {
  return { clickedAt, visitor: 'v1', referrer: null, device: 'desktop', ...overrides };
}

describe('createClicksRepository', () => {
  let db: DatabaseSync;
  let code: string;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const userId = createUsersRepository(db).create({
      email: 'ana@example.com',
      passwordHash: 'hash',
      name: 'Ana',
    })!.id;
    code = createUrlsRepository(db).create('https://example.com/', userId).code;
  });

  afterEach(() => db.close());

  function counters() {
    return db.prepare('SELECT click_count, last_click_at FROM urls WHERE code = ?').get(code);
  }

  function clickCount(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM clicks').get() as { n: number }).n;
  }

  it('guarda el click asociado a la URL del código', () => {
    const recorded = createClicksRepository(db).record(
      code,
      click('2026-11-04T10:00:00.000Z', { referrer: 'www.google.com', device: 'mobile' }),
    );

    expect(recorded).toBe(true);
    expect(db.prepare('SELECT clicked_at, visitor, referrer, device FROM clicks').all()).toEqual([
      { clicked_at: '2026-11-04T10:00:00.000Z', visitor: 'v1', referrer: 'www.google.com', device: 'mobile' },
    ]);
  });

  it('devuelve false y no guarda nada si el código no existe', () => {
    expect(createClicksRepository(db).record('nada123', click('2026-11-04T10:00:00.000Z'))).toBe(false);
    expect(clickCount()).toBe(0);
  });

  it('actualiza los contadores de la URL con el click más reciente, aunque llegue desordenado', () => {
    const clicks = createClicksRepository(db);

    clicks.record(code, click('2026-11-04T10:00:00.000Z'));
    clicks.record(code, click('2026-11-01T10:00:00.000Z'));

    expect(counters()).toEqual({ click_count: 2, last_click_at: '2026-11-04T10:00:00.000Z' });
  });

  it('guarda los clicks de bots pero no los cuenta', () => {
    createClicksRepository(db).record(code, click('2026-11-04T10:00:00.000Z', { device: 'bot' }));

    expect(clickCount()).toBe(1);
    expect(counters()).toEqual({ click_count: 0, last_click_at: null });
  });

  it('borra los clicks al borrar su URL', () => {
    createClicksRepository(db).record(code, click('2026-11-04T10:00:00.000Z'));

    createUrlsRepository(db).remove(code);

    expect(clickCount()).toBe(0);
  });
});
