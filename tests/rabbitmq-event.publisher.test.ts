import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import pino from 'pino';
import type { Channel } from 'amqplib';
import { RabbitmqEventPublisher, type EventEnvelope } from '../src/infrastructure/messaging/rabbitmq/rabbitmq-event.publisher.ts';
import type { RabbitMqConnection } from '../src/infrastructure/messaging/rabbitmq/rabbitmq.connection.ts';

const logger = pino({ level: 'silent' });
const EXCHANGE = 'rhm.events';
const PRODUCER = 'empleados-service';

function fakeConnection(channel: Channel | null): RabbitMqConnection {
  return { ensureChannel: async () => channel } as unknown as RabbitMqConnection;
}

describe('RabbitmqEventPublisher', () => {
  test('declara el exchange y publica el envelope con la routing key igual al tipo', async () => {
    const published: { exchange: string; routingKey: string; content: Buffer; options: unknown }[] = [];
    const exchanges: unknown[] = [];
    const channel = {
      assertExchange: async (exchange: string, type: string, options: unknown) => {
        exchanges.push({ exchange, type, options });
      },
      publish: (exchange: string, routingKey: string, content: Buffer, options: unknown) => {
        published.push({ exchange, routingKey, content, options });
        return true;
      },
    } as unknown as Channel;

    const publisher = new RabbitmqEventPublisher(fakeConnection(channel), EXCHANGE, PRODUCER, logger);
    await publisher.publish({ type: 'empleado.creado', data: { id: 'E001' } });

    assert.equal(exchanges.length, 1);
    assert.deepEqual(exchanges[0], { exchange: EXCHANGE, type: 'topic', options: { durable: true } });

    assert.equal(published.length, 1);
    assert.equal(published[0].exchange, EXCHANGE);
    assert.equal(published[0].routingKey, 'empleado.creado');

    const envelope = JSON.parse(published[0].content.toString()) as EventEnvelope<{ id: string }>;
    assert.match(envelope.id, /^[0-9a-f-]{36}$/i);
    assert.equal(envelope.type, 'empleado.creado');
    assert.equal(envelope.version, 1);
    assert.equal(envelope.producer, PRODUCER);
    assert.match(envelope.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(envelope.data, { id: 'E001' });
  });

  test('no rechaza cuando el broker no tiene canal disponible', async () => {
    const publisher = new RabbitmqEventPublisher(fakeConnection(null), EXCHANGE, PRODUCER, logger);
    await publisher.publish({ type: 'empleado.creado', data: {} });
  });

  test('no rechaza cuando assertExchange o publish lanzan una excepción', async () => {
    const channel = {
      assertExchange: async () => {
        throw new Error('el broker no responde');
      },
      publish: () => true,
    } as unknown as Channel;

    const publisher = new RabbitmqEventPublisher(fakeConnection(channel), EXCHANGE, PRODUCER, logger);
    await publisher.publish({ type: 'empleado.creado', data: {} });
  });
});
