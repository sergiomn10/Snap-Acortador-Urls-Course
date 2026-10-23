import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('usa los valores por defecto sin variables de entorno', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      isProduction: false,
      port: 3000,
      dbName: 'snap.db',
    });
  });

  it('trata las variables vacías como no definidas', () => {
    expect(loadConfig({ PORT: '', DB_NAME: '  ' })).toMatchObject({
      port: 3000,
      dbName: 'snap.db',
    });
  });

  it('lee los valores de las variables de entorno', () => {
    expect(loadConfig({ NODE_ENV: 'production', PORT: '8080', DB_NAME: 'prod.db' })).toEqual({
      env: 'production',
      isProduction: true,
      port: 8080,
      dbName: 'prod.db',
    });
  });

  it('lanza un error si falta DB_NAME en producción', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /DB_NAME es obligatoria en producción/,
    );
  });

  it.each(['abc', '0', '70000', '3000.5'])('rechaza PORT="%s"', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT=.*debe ser un entero/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV="staging" no es válido/);
  });

  it('reporta todos los problemas a la vez', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', PORT: 'x' })).toThrow(
      /DB_NAME[\s\S]*PORT/,
    );
  });
});
