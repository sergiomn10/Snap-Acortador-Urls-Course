import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const PROD_SECRET = 'x'.repeat(32);
const VISITOR_SECRET = 'y'.repeat(32);

describe('loadConfig', () => {
  it('usa los valores por defecto sin variables de entorno', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      isProduction: false,
      port: 3000,
      dbName: 'snap.db',
      jwtSecret: expect.any(String),
      visitorHashSecret: expect.any(String),
    });
  });

  it('trata las variables vacías como no definidas', () => {
    expect(loadConfig({ PORT: '', DB_NAME: '  ' })).toMatchObject({
      port: 3000,
      dbName: 'snap.db',
    });
  });

  it('lee los valores de las variables de entorno', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        DB_NAME: 'prod.db',
        JWT_SECRET: PROD_SECRET,
        VISITOR_HASH_SECRET: VISITOR_SECRET,
      }),
    ).toEqual({
      env: 'production',
      isProduction: true,
      port: 8080,
      dbName: 'prod.db',
      jwtSecret: PROD_SECRET,
      visitorHashSecret: VISITOR_SECRET,
    });
  });

  it.each(['DB_NAME', 'JWT_SECRET', 'VISITOR_HASH_SECRET'])(
    'lanza un error si falta %s en producción',
    (name) => {
      const env = {
        NODE_ENV: 'production',
        DB_NAME: 'prod.db',
        JWT_SECRET: PROD_SECRET,
        VISITOR_HASH_SECRET: VISITOR_SECRET,
      };
      delete env[name as keyof typeof env];

      expect(() => loadConfig(env)).toThrow(ConfigError);
      expect(() => loadConfig(env)).toThrow(new RegExp(`${name} es obligatoria en producción`));
    },
  );

  it.each(['JWT_SECRET', 'VISITOR_HASH_SECRET'])(
    'rechaza un %s demasiado corto sin mostrar su valor',
    (name) => {
      expect(() => loadConfig({ [name]: 'corto-secreto' })).toThrow(
        new RegExp(`${name} debe tener al menos 32 caracteres`),
      );
      expect(() => loadConfig({ [name]: 'corto-secreto' })).not.toThrow(/corto-secreto/);
    },
  );

  it.each(['abc', '0', '70000', '3000.5'])('rechaza PORT="%s"', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT=.*debe ser un entero/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV="staging" no es válido/);
  });

  it('reporta todos los problemas a la vez', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', PORT: 'x' })).toThrow(
      /DB_NAME[\s\S]*JWT_SECRET[\s\S]*PORT/,
    );
  });
});
