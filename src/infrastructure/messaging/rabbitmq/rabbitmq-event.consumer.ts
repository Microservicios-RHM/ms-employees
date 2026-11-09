import type { ConsumeMessage } from 'amqplib';
import { context, propagation, SpanKind, trace } from '@opentelemetry/api';
import type { Logger } from 'pino';
import type { ProcessedEventRepository } from '../../../domain/repositories/processed-event.repository.ts';
import type { RabbitMqConnection } from './rabbitmq.connection.ts';
import { parseEnvelope, type EventEnvelope } from './event-envelope.ts';

export type EventHandler = (event: EventEnvelope) => Promise<void>;

export class RabbitmqEventConsumer {
  private readonly connection: RabbitMqConnection;
  private readonly exchange: string;
  private readonly queue: string;
  private readonly processedEvents: ProcessedEventRepository;
  private readonly logger: Logger;
  private readonly handlers = new Map<string, EventHandler>();
  private stopped = false;

  constructor(
    connection: RabbitMqConnection,
    exchange: string,
    queue: string,
    processedEvents: ProcessedEventRepository,
    logger: Logger,
  ) {
    this.connection = connection;
    this.exchange = exchange;
    this.queue = queue;
    this.processedEvents = processedEvents;
    this.logger = logger;
  }

  on(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
  }

  async start(): Promise<void> {
    const channel = await this.connection.ensureChannel();
    if (!channel) {
      this.logger.error('RabbitMQ unavailable; vacation lifecycle events are not being consumed');
      return;
    }

    await channel.prefetch(10);
    await channel.assertExchange(this.exchange, 'topic', { durable: true });
    await channel.assertQueue(this.queue, { durable: true });
    for (const eventType of this.handlers.keys()) {
      await channel.bindQueue(this.queue, this.exchange, eventType);
    }
    await channel.consume(this.queue, (message) => void this.consume(message));
    channel.once('close', () => {
      if (!this.stopped) void this.start().catch((error: unknown) =>
        this.logger.error({ err: error }, 'RabbitMQ consumer resubscription failed'),
      );
    });
    this.logger.info({ queue: this.queue, bindings: [...this.handlers.keys()] }, 'RabbitMQ consumer ready');
  }

  stop(): void { this.stopped = true; }

  private async consume(message: ConsumeMessage | null): Promise<void> {
    if (!message) return;
    const channel = await this.connection.ensureChannel();
    if (!channel) return;
    try {
      const routingKey = message.fields.routingKey;
      const handler = this.handlers.get(routingKey);
      if (!handler) {
        channel.ack(message);
        return;
      }
      const envelope = parseEnvelope(message.content.toString());
      if (!(await this.processedEvents.markAsProcessed(envelope.id))) {
        this.logger.info({ eventId: envelope.id, eventType: envelope.type }, 'Duplicate event ignored');
        channel.ack(message);
        return;
      }
      const headers = Object.fromEntries(Object.entries(message.properties.headers ?? {}).map(([key, value]) => [key, Buffer.isBuffer(value) ? value.toString() : String(value)]));
      const parent = propagation.extract(context.active(), headers);
      await trace.getTracer('empleados-service').startActiveSpan(`consume ${routingKey}`, { kind: SpanKind.CONSUMER }, parent, async (span) => {
        try { await handler(envelope); } finally { span.end(); }
      });
      channel.ack(message);
    } catch (error) {
      this.logger.error({ err: error }, 'Vacation lifecycle event discarded');
      channel.nack(message, false, false);
    }
  }
}
