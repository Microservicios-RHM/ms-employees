import pg from 'pg';
import type { DatabaseConfig } from '../../../config/environment.config.ts';

const { Pool } = pg;

export function createPostgresPool(config: DatabaseConfig): pg.Pool {
  return new Pool({
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
}
