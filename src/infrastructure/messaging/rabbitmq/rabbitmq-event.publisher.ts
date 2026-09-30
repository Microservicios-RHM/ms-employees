import { randomUUID } from 'node:crypto';
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
      channel.publish(this.exchange, event.type, Buffer.from(JSON.stringify(envelope)), {
        contentType: 'application/json',
        persistent: true,
        messageId: envelope.id,
      });
      this.logger.info({ eventType: event.type, eventId: envelope.id }, 'Event published');
    } catch (error) {
      this.logger.error(
        { err: error, eventType: event.type, eventId: envelope.id },
        'Event publish failed',
      );
    }
  }
}
