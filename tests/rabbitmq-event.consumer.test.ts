import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Channel, ConsumeMessage } from 'amqplib';
import pino from 'pino';
import type { ProcessedEventRepository } from '../src/domain/repositories/processed-event.repository.ts';
import { RabbitmqEventConsumer } from '../src/infrastructure/messaging/rabbitmq/rabbitmq-event.consumer.ts';
import type { RabbitMqConnection } from '../src/infrastructure/messaging/rabbitmq/rabbitmq.connection.ts';

test('consume un evento con traceparent y confirma el mensaje', async () => {
  let callback: ((message: ConsumeMessage | null) => void) | undefined;
  const acknowledgements: ConsumeMessage[] = [];
  const channel = {
    prefetch: async () => undefined,
    assertExchange: async () => undefined,
    assertQueue: async () => ({ queue: 'empleados.vacaciones' }),
    bindQueue: async () => undefined,
    consume: async (_queue: string, handler: (message: ConsumeMessage | null) => void) => {
      callback = handler;
      return { consumerTag: 'consumer-1' };
    },
    once: () => undefined,
    ack: (message: ConsumeMessage) => acknowledgements.push(message),
  } as unknown as Channel;
  const connection = { ensureChannel: async () => channel } as unknown as RabbitMqConnection;
  const processedEvents = {
    markAsProcessed: async () => true,
  } satisfies ProcessedEventRepository;
  const consumer = new RabbitmqEventConsumer(
    connection,
    'rhm.events',
    'empleados.vacaciones',
    processedEvents,
    pino({ level: 'silent' }),
  );
  let handledId: string | undefined;
  consumer.on('vacaciones.iniciadas', async (event) => { handledId = event.id; });
  await consumer.start();

  const message = {
    fields: { routingKey: 'vacaciones.iniciadas' },
    properties: {
      headers: {
        traceparent: Buffer.from('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'),
      },
    },
    content: Buffer.from(JSON.stringify({
      id: 'evt-1',
      type: 'vacaciones.iniciadas',
      version: 1,
      occurredAt: '2026-11-08T12:00:00.000Z',
      producer: 'vacaciones-service',
      data: { empleadoId: 'E001' },
    })),
  } as unknown as ConsumeMessage;

  assert.ok(callback);
  callback(message);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(handledId, 'evt-1');
  assert.deepEqual(acknowledgements, [message]);
});
