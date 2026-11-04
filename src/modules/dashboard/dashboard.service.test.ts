import { describe, expect, it } from 'vitest';
import { changePct, fillDays, periodWindow } from './dashboard.service.ts';

describe('periodWindow', () => {
  it('acaba al final de hoy (UTC) e incluye days días', () => {
    expect(periodWindow(new Date('2026-11-04T23:59:59.999Z'), 7)).toEqual({
      prevFrom: '2026-10-22T00:00:00.000Z',
      from: '2026-10-29T00:00:00.000Z',
      to: '2026-11-05T00:00:00.000Z',
    });
  });

  it('cruza correctamente fin de mes y de año', () => {
    expect(periodWindow(new Date('2026-01-02T08:00:00.000Z'), 30)).toEqual({
      prevFrom: '2025-11-04T00:00:00.000Z',
      from: '2025-12-04T00:00:00.000Z',
      to: '2026-01-03T00:00:00.000Z',
    });
  });
});

describe('changePct', () => {
  it.each([
    [150, 100, 50],
    [50, 100, -50],
    [1, 3, -66.7],
    [0, 4, -100],
    [7, 7, 0],
  ])('%i frente a %i da %d', (current, previous, expected) => {
    expect(changePct(current, previous)).toBe(expected);
  });

  it('es null si el periodo anterior no tuvo clicks', () => {
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(0, 0)).toBeNull();
  });
});

describe('fillDays', () => {
  it('devuelve un elemento por día, con ceros en los días sin clicks', () => {
    const window = periodWindow(new Date('2026-11-04T12:00:00.000Z'), 7);

    const days = fillDays([{ date: '2026-10-31', clicks: 4, uniqueVisitors: 2 }], window);

    expect(days.map((d) => d.date)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(days[2]).toEqual({ date: '2026-10-31', clicks: 4, uniqueVisitors: 2 });
    expect(days.filter((d) => d.clicks === 0)).toHaveLength(6);
  });
});
