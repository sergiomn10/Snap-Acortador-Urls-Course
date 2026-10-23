import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createDatabase } from '../../db/database.ts';
import { listen, type TestServer } from '../../testing/listen.ts';

describe('GET /health', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await listen(createApp({ db: createDatabase(':memory:') }));
  });

  afterAll(() => server.close());

  it('responde 200 con status ok', async () => {
    const res = await fetch(`${server.baseUrl}/health`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = (await res.json()) as { status: string; uptime: number };
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });
});
