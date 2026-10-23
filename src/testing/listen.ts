import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

/** Levanta la app en un puerto libre para tests HTTP reales. */
export async function listen(app: Express): Promise<TestServer> {
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
