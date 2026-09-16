import type { Logger } from 'pino';
import type pg from 'pg';
import type { DatabaseConfig } from '../../../config/environment.config.ts';

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForPostgres(
  pool: pg.Pool,
  config: DatabaseConfig,
  logger: Logger,
): Promise<void> {
  for (let attempt = 1; attempt <= config.connectMaxAttempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === config.connectMaxAttempts) throw error;

      const waitTime = config.connectRetryDelayMs * 2 ** (attempt - 1);
      logger.warn(
        { attempt, maxAttempts: config.connectMaxAttempts, retryInMs: waitTime },
        'PostgreSQL is not ready; retrying connection',
      );
      await delay(waitTime);
    }
  }
}
