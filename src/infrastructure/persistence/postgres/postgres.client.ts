import pg from 'pg';
import type { Logger } from 'pino';
import type { DatabaseConfig } from '../../../config/environment.config.ts';

const { Pool } = pg;

export function createPostgresPool(config: DatabaseConfig, logger?: Logger): pg.Pool {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: config.ssl ? { rejectUnauthorized: true } : false,
    application_name: 'ms-employees',
  });

  pool.on('error', (error) => {
    logger?.error({ err: error }, 'Unexpected PostgreSQL pool error');
  });

  return pool;
}
