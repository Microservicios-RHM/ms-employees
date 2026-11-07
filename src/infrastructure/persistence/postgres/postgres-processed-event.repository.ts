import type pg from 'pg';
import type { ProcessedEventRepository } from '../../../domain/repositories/processed-event.repository.ts';

export class PostgresProcessedEventRepository implements ProcessedEventRepository {
  private readonly pool: pg.Pool;
  private readonly schema: string;

  constructor(
    pool: pg.Pool,
    schema: string,
  ) {
    this.pool = pool;
    this.schema = schema;
  }

  async markAsProcessed(eventId: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO "${this.schema}".eventos_procesados (id) VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [eventId],
    );
    return result.rowCount === 1;
  }
}
