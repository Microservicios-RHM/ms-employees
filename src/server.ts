import http from 'node:http';
import { createApp } from './app.ts';
import { loadConfig } from './config/environment.config.ts';
import { createPostgresPool } from './infrastructure/persistence/postgres/postgres.client.ts';
import { PostgresEmployeeRepository } from './infrastructure/persistence/postgres/postgres-employee.repository.ts';
import { runMigrations } from './infrastructure/persistence/postgres/migrations/migration.runner.ts';

const config = loadConfig();
const pool = createPostgresPool(config.database);
await runMigrations(pool, config.database.schema);

const repository = new PostgresEmployeeRepository(pool, config.database.schema);
const app = createApp(repository);
const port = config.port;
const server = http.createServer(app);

server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor de empleados escuchando en http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} recibido. Cerrando el servidor...`);
  server.close(async (error) => {
    if (error) {
      console.error('No fue posible cerrar el servidor correctamente.', error);
      process.exit(1);
    }
    await pool.end();
    process.exit(0);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => shutdown(signal));
}
