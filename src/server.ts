import http from 'node:http';
import { createApp } from './app.ts';
import { loadConfig } from './config/environment.config.ts';
import { createPostgresPool } from './infrastructure/persistence/postgres/postgres.client.ts';
import { PostgresEmployeeRepository } from './infrastructure/persistence/postgres/postgres-employee.repository.ts';
import { runMigrations } from './infrastructure/persistence/postgres/migrations/migration.runner.ts';
import { createLogger } from './infrastructure/logging/pino.logger.ts';
import { waitForPostgres } from './infrastructure/persistence/postgres/postgres-readiness.ts';
import { HttpDepartmentClient } from './infrastructure/http/clients/http-department.client.ts';
import { RabbitMqConnection } from './infrastructure/messaging/rabbitmq/rabbitmq.connection.ts';
import { RabbitmqEventPublisher } from './infrastructure/messaging/rabbitmq/rabbitmq-event.publisher.ts';
import { RabbitmqEventConsumer } from './infrastructure/messaging/rabbitmq/rabbitmq-event.consumer.ts';
import { PostgresProcessedEventRepository } from './infrastructure/persistence/postgres/postgres-processed-event.repository.ts';
import { SynchronizeVacationStatus } from './application/use-cases/synchronize-vacation-status.use-case.ts';
import { CONSUMED_EVENT_TYPES, EVENT_PRODUCER } from './shared/constants/event-types.constants.ts';
import { startTelemetry, stopTelemetry } from './infrastructure/observability/telemetry.ts';

startTelemetry();
const config = loadConfig();
const logger = createLogger(config.logging);
const pool = createPostgresPool(config.database, logger);
const brokerConnection = new RabbitMqConnection(config.broker, logger);

async function bootstrap(): Promise<void> {
  logger.info(
    {
      database: {
        host: config.database.host,
        port: config.database.port,
        name: config.database.database,
        schema: config.database.schema,
        user: config.database.user,
      },
    },
    'Connecting to PostgreSQL',
  );

  await waitForPostgres(pool, config.database, logger);
  const appliedMigrations = await runMigrations(pool, config.database.schema);
  for (const migration of appliedMigrations) {
    logger.info({ migration }, 'Database migration applied');
  }
  logger.info('PostgreSQL connection ready');

  logger.info({ exchange: config.broker.exchange }, 'Connecting to RabbitMQ');
  await brokerConnection.connect();

  const repository = new PostgresEmployeeRepository(pool, config.database.schema);
  const departmentClient = new HttpDepartmentClient(config.departments, logger);
  const eventPublisher = new RabbitmqEventPublisher(
    brokerConnection,
    config.broker.exchange,
    EVENT_PRODUCER,
    logger,
  );
  const processedEvents = new PostgresProcessedEventRepository(pool, config.database.schema);
  const vacationStatus = new SynchronizeVacationStatus(repository);
  const consumer = new RabbitmqEventConsumer(
    brokerConnection, config.broker.exchange, config.broker.queue, processedEvents, logger,
  );
  consumer.on(CONSUMED_EVENT_TYPES.VACATION_STARTED, async (event) => {
    await vacationStatus.started((event.data as { empleadoId: string }).empleadoId);
  });
  consumer.on(CONSUMED_EVENT_TYPES.VACATION_FINISHED, async (event) => {
    await vacationStatus.finished((event.data as { empleadoId: string }).empleadoId);
  });
  await consumer.start();
  await departmentClient.warmUpCatalog();
  const app = createApp(
    repository,
    departmentClient,
    eventPublisher,
    logger,
    departmentClient,
    config.cacheAdminToken,
  );
  const server = http.createServer(app);

  server.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'Employee service started');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Graceful shutdown started');
    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }
      await brokerConnection.close();
      consumer.stop();
      await pool.end();
      await stopTelemetry();
      logger.info('Employee service stopped');
      process.exit();
    });
  };

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => shutdown(signal));
  }
}

bootstrap().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Employee service failed to start');
  await brokerConnection.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
