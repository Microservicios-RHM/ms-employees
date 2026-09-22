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
  DB_CONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  DB_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(30_000).default(1000),
  DEPARTMENTS_SERVICE_URL: z.string().url().default('http://localhost:8081'),
  DEPARTMENTS_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2000),
  DEPARTMENTS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  DEPARTMENTS_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).max(10_000).default(1000),
  DEPARTMENTS_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(9000),
  DEPARTMENTS_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).max(100).default(3),
  DEPARTMENTS_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(30_000),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === 'production' && environment.LOG_PRETTY === 'true') {
    context.addIssue({
      code: 'custom',
      path: ['LOG_PRETTY'],
      message: 'LOG_PRETTY debe ser false en producción',
    });
  }

  if (environment.DEPARTMENTS_TOTAL_TIMEOUT_MS < environment.DEPARTMENTS_TIMEOUT_MS) {
    context.addIssue({
      code: 'custom',
      path: ['DEPARTMENTS_TOTAL_TIMEOUT_MS'],
      message: 'Debe ser mayor o igual a DEPARTMENTS_TIMEOUT_MS',
    });
  }
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
  readonly connectMaxAttempts: number;
  readonly connectRetryDelayMs: number;
}

export interface AppConfig {
  readonly port: number;
  readonly database: DatabaseConfig;
  readonly logging: LoggingConfig;
  readonly departments: {
    readonly baseUrl: string;
    readonly timeoutMs: number;
    readonly maxAttempts: number;
    readonly retryBaseDelayMs: number;
    readonly totalTimeoutMs: number;
    readonly circuitBreakerThreshold: number;
    readonly circuitBreakerResetTimeoutMs: number;
  };
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
    departments: {
      baseUrl: env.DEPARTMENTS_SERVICE_URL.replace(/\/$/, ''),
      timeoutMs: env.DEPARTMENTS_TIMEOUT_MS,
      maxAttempts: env.DEPARTMENTS_MAX_ATTEMPTS,
      retryBaseDelayMs: env.DEPARTMENTS_RETRY_BASE_DELAY_MS,
      totalTimeoutMs: env.DEPARTMENTS_TOTAL_TIMEOUT_MS,
      circuitBreakerThreshold: env.DEPARTMENTS_CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerResetTimeoutMs: env.DEPARTMENTS_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
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
      connectMaxAttempts: env.DB_CONNECT_MAX_ATTEMPTS,
      connectRetryDelayMs: env.DB_CONNECT_RETRY_DELAY_MS,
    },
  };
}
