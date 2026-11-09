export function createProcessedEventsMigration(schema: string) {
  return {
    version: 3,
    name: 'create_processed_events',
    sql: `
      CREATE TABLE "${schema}".eventos_procesados (
        id UUID PRIMARY KEY,
        procesado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  } as const;
}
