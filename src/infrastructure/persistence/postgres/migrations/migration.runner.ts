import type pg from 'pg';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../../../../config/environment.config.ts';
import { createPostgresPool } from '../postgres.client.ts';
import { createEmployeesMigration } from './001-create-employees-table.migration.ts';

const migrations = [createEmployeesMigration];

export async function runMigrations(pool: pg.Pool, schema: string): Promise<string[]> {
  const client = await pool.connect();
  const appliedMigrations: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [728_401]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}" AUTHORIZATION CURRENT_USER`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const applied = await client.query(
        `SELECT 1 FROM "${schema}".schema_migrations WHERE version = $1`,
        [migration.version],
      );
      if (applied.rowCount) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "${schema}".schema_migrations (version, name) VALUES ($1, $2)`,
          [migration.version, migration.name],
        );
        await client.query('COMMIT');
        appliedMigrations.push(`${migration.version} - ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [728_401]);
    client.release();
  }
  return appliedMigrations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = loadConfig();
  const { createLogger } = await import('../../../logging/pino.logger.ts');
  const logger = createLogger(config.logging);
  const pool = createPostgresPool(config.database);
  try {
    const appliedMigrations = await runMigrations(pool, config.database.schema);
    if (appliedMigrations.length === 0) {
      logger.info('Database schema is up to date');
    }
    for (const migration of appliedMigrations) {
      logger.info({ migration }, 'Database migration applied');
    }
  } finally {
    await pool.end();
  }
}
