import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { hashVisitor } from './click-info.ts';
import type { Click, ClicksRepository } from './clicks.repository.ts';
import { createClickTracker } from './click-tracker.ts';

const SECRET = 's'.repeat(32);
const NOW = new Date('2026-11-04T10:00:00.000Z');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148';

function fakeRequest(method: string, headers: Record<string, string> = {}): Request {
  return { method, ip: '1.2.3.4', get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function recorder() {
  const recorded: Array<{ code: string; click: Click }> = [];
  const clicks: ClicksRepository = {
    record: (code, click) => {
      recorded.push({ code, click });
      return true;
    },
  };
  return { clicks, recorded };
}

describe('createClickTracker', () => {
  it('registra la visita con la hora, el visitante, el host del referer y el dispositivo', () => {
    const { clicks, recorded } = recorder();
    const track = createClickTracker({ clicks, visitorHashSecret: SECRET, now: () => NOW });

    track(
      'abc1234',
      fakeRequest('GET', { 'user-agent': IPHONE_UA, referer: 'https://t.co/xyz?utm=1' }),
    );

    expect(recorded).toEqual([
      {
        code: 'abc1234',
        click: {
          clickedAt: '2026-11-04T10:00:00.000Z',
          visitor: hashVisitor('1.2.3.4', IPHONE_UA, SECRET),
          referrer: 't.co',
          device: 'mobile',
        },
      },
    ]);
  });

  it('no registra peticiones HEAD', () => {
    const { clicks, recorded } = recorder();
    const track = createClickTracker({ clicks, visitorHashSecret: SECRET });

    track('abc1234', fakeRequest('HEAD', { 'user-agent': IPHONE_UA }));

    expect(recorded).toEqual([]);
  });

  it('no lanza si falla el registro: lo deja en el log', () => {
    const log = vi.fn();
    const clicks: ClicksRepository = {
      record: () => {
        throw new Error('database is locked');
      },
    };
    const track = createClickTracker({ clicks, visitorHashSecret: SECRET, log });

    expect(() => track('abc1234', fakeRequest('GET'))).not.toThrow();
    expect(log).toHaveBeenCalledWith('No se pudo registrar el click de abc1234', expect.any(Error));
  });
});
