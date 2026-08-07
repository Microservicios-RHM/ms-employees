import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DB_HOST: z.string().trim().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().trim().min(1),
  DB_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/i).default('employees'),
  DB_USER: z.string().trim().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
});

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly schema: string;
  readonly user: string;
  readonly password: string;
  readonly ssl: boolean;
  readonly poolMax: number;
}

export interface AppConfig {
  readonly port: number;
  readonly database: DatabaseConfig;
  readonly logging: LoggingConfig;
}

export interface LoggingConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly pretty: boolean;
}

export function loadConfig(): AppConfig {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configuración inválida o incompleta: ${missing}`);
  }

  const env = result.data;
  return {
    port: env.PORT,
    logging: {
      environment: env.NODE_ENV,
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY === 'true',
    },
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      schema: env.DB_SCHEMA,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: env.DB_SSL === 'true',
      poolMax: env.DB_POOL_MAX,
    },
  };
}
