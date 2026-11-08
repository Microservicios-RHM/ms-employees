import { randomUUID } from 'node:crypto';
import { context, propagation, SpanKind, trace } from '@opentelemetry/api';
import type { Logger } from 'pino';
import type { DomainEvent, EventPublisher } from '../../../domain/gateways/event-publisher.gateway.ts';
import type { RabbitMqConnection } from './rabbitmq.connection.ts';

export interface EventEnvelope<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly occurredAt: string;
  readonly producer: string;
  readonly data: T;
}

const EVENT_ENVELOPE_VERSION = 1;
const EXCHANGE_TYPE = 'topic';

export class RabbitmqEventPublisher implements EventPublisher {
  private readonly connection: RabbitMqConnection;
  private readonly exchange: string;
  private readonly producer: string;
  private readonly logger: Logger;

  constructor(connection: RabbitMqConnection, exchange: string, producer: string, logger: Logger) {
    this.connection = connection;
    this.exchange = exchange;
    this.producer = producer;
    this.logger = logger;
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    const envelope: EventEnvelope<T> = {
      id: randomUUID(),
      type: event.type,
      version: EVENT_ENVELOPE_VERSION,
      occurredAt: new Date().toISOString(),
      producer: this.producer,
      data: event.data,
    };

    const span = trace.getTracer('empleados-service').startSpan(`publish ${event.type}`, {
      kind: SpanKind.PRODUCER,
      attributes: { 'messaging.system': 'rabbitmq', 'messaging.destination.name': this.exchange, 'messaging.operation.name': 'publish' },
    });
    try {
      const channel = await this.connection.ensureChannel();
      if (!channel) {
        this.logger.error(
          { eventType: event.type, eventId: envelope.id },
          'Event not published: RabbitMQ unavailable',
        );
        return;
      }

      await channel.assertExchange(this.exchange, EXCHANGE_TYPE, { durable: true });
      const headers: Record<string, string> = {};
      propagation.inject(trace.setSpan(context.active(), span), headers);
      channel.publish(this.exchange, event.type, Buffer.from(JSON.stringify(envelope)), {
        contentType: 'application/json',
        persistent: true,
        messageId: envelope.id,
        headers,
      });
      this.logger.info({ eventType: event.type, eventId: envelope.id }, 'Event published');
    } catch (error) {
      this.logger.error(
        { err: error, eventType: event.type, eventId: envelope.id },
        'Event publish failed',
      );
    } finally {
      span.end();
    }
  }
}
