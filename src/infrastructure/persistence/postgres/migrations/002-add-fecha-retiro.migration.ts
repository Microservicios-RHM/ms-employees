export function addFechaRetiroMigration(schema: string) {
  return {
    version: 2,
    name: 'add_fecha_retiro',
    sql: `
      ALTER TABLE "${schema}".employees ADD COLUMN fecha_retiro TIMESTAMPTZ NULL;
      CREATE INDEX employees_fecha_retiro_idx ON "${schema}".employees (fecha_retiro);
    `,
  } as const;
}
