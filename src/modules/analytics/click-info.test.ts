import { describe, expect, it } from 'vitest';
import { classifyDevice, hashVisitor, referrerHost } from './click-info.ts';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  whatsapp: 'WhatsApp/2.23.20.0',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  curl: 'curl/8.9.1',
};

describe('classifyDevice', () => {
  it.each([
    ['chromeWindows', 'desktop'],
    ['curl', 'desktop'],
    ['iphone', 'mobile'],
    ['androidPhone', 'mobile'],
    ['androidTablet', 'tablet'],
    ['ipad', 'tablet'],
    ['googlebot', 'bot'],
    ['whatsapp', 'bot'],
    ['slack', 'bot'],
  ] as const)('clasifica %s como %s', (name, device) => {
    expect(classifyDevice(UA[name])).toBe(device);
  });

  it.each([undefined, '', '   '])('trata un User-Agent ausente (%j) como bot', (ua) => {
    expect(classifyDevice(ua)).toBe('bot');
  });
});

describe('referrerHost', () => {
  it('se queda solo con el host, sin ruta ni query', () => {
    expect(referrerHost('https://www.google.com/search?q=dato+personal')).toBe('www.google.com');
  });

  it.each([undefined, '', 'no es una url', 'android-app://com.google.android.gm/'])(
    'devuelve null para %j',
    (referer) => {
      expect(referrerHost(referer)).toBeNull();
    },
  );
});

describe('hashVisitor', () => {
  const secret = 's'.repeat(32);

  it('es estable para la misma IP y User-Agent', () => {
    expect(hashVisitor('1.2.3.4', UA.iphone, secret)).toBe(hashVisitor('1.2.3.4', UA.iphone, secret));
  });

  it('distingue IPs, User-Agents y secretos distintos', () => {
    const base = hashVisitor('1.2.3.4', UA.iphone, secret);

    expect(hashVisitor('1.2.3.5', UA.iphone, secret)).not.toBe(base);
    expect(hashVisitor('1.2.3.4', UA.ipad, secret)).not.toBe(base);
    expect(hashVisitor('1.2.3.4', UA.iphone, 't'.repeat(32))).not.toBe(base);
  });

  it('no contiene la IP en claro', () => {
    expect(hashVisitor('1.2.3.4', UA.iphone, secret)).not.toContain('1.2.3.4');
  });
});
