/**
 * Propagación del contexto de traza a través de RabbitMQ (Reto 8).
 *
 * Por HTTP la propagación la hace la instrumentación automática, pero un mensaje AMQP no es una
 * petición HTTP: si nadie copia el `traceparent` a las cabeceras del mensaje, cada consumidor
 * (auth, notificaciones, perfiles, vacaciones) empieza una traza nueva y el onboarding aparece en
 * Zipkin como trazas sueltas. Aquí se crea un span PRODUCER por cada publicación y su contexto se
 * inyecta (W3C Trace Context) en las cabeceras del mensaje; los consumidores lo extraen.
 */
import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('rhm-messaging');

export type MessageHeaders = Record<string, string>;

export async function withPublishSpan<T>(
  exchange: string,
  routingKey: string,
  publish: (headers: MessageHeaders) => Promise<T> | T,
): Promise<T> {
  return tracer.startActiveSpan(
    `${routingKey} publish`,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        'messaging.system': 'rabbitmq',
        'messaging.operation.type': 'publish',
        'messaging.destination.name': exchange,
        'messaging.rabbitmq.destination.routing_key': routingKey,
      },
    },
    async (span) => {
      try {
        const headers: MessageHeaders = {};
        propagation.inject(context.active(), headers);
        return await publish(headers);
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
