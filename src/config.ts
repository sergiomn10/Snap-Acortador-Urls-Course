export type NodeEnv = 'development' | 'production' | 'test';

export interface Config {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly port: number;
  readonly dbName: string;
}

type Env = Readonly<Record<string, string | undefined>>;

// Vitest fija NODE_ENV=test, por eso se acepta además de development/production.
const NODE_ENVS: readonly NodeEnv[] = ['development', 'production', 'test'];

// En producción no se aplican fallbacks para estas variables.
const REQUIRED_IN_PRODUCTION = ['DB_NAME'] as const;

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Configuración inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === '' ? undefined : value;
}

/** Construye la configuración a partir de un entorno. Lanza ConfigError si es inválida. */
export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];

  const rawEnv = read(env, 'NODE_ENV') ?? 'development';
  if (!NODE_ENVS.includes(rawEnv as NodeEnv)) {
    problems.push(`NODE_ENV="${rawEnv}" no es válido (usa ${NODE_ENVS.join(', ')})`);
  }
  const nodeEnv = rawEnv as NodeEnv;
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (read(env, name) === undefined) {
        problems.push(`${name} es obligatoria en producción`);
      }
    }
  }

  const rawPort = read(env, 'PORT') ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT="${rawPort}" debe ser un entero entre 1 y 65535`);
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return Object.freeze({
    env: nodeEnv,
    isProduction,
    port,
    dbName: read(env, 'DB_NAME') ?? 'snap.db',
  });
}

// Se evalúa al importar el módulo: una configuración inválida falla al arrancar.
export const config: Config = loadConfig();
