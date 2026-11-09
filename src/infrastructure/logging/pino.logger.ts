import { trace } from '@opentelemetry/api';
import pino, { type Logger } from 'pino';
import type { LoggingConfig } from '../../config/environment.config.ts';

// Reto 8: mismo nombre que OTEL_SERVICE_NAME, para cruzar en Grafana los logs (Loki) con las
// trazas (Zipkin) del mismo servicio.
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'empleados-service';

/**
 * Log estructurado JSON con los campos mínimos del Reto 8:
 *   {"timestamp":"...","level":"INFO","service":"empleados-service","traceId":"...","message":"..."}
 * traceId/spanId salen del span activo de OpenTelemetry: con ellos un log de Loki lleva a su traza
 * en Zipkin. Fuera de una petición (arranque, apagado) no hay span y esos campos no aparecen.
 */
export function createLogger(config: LoggingConfig): Logger {
  return pino({
    level: config.level,
    messageKey: 'message',
    base: {
      service: SERVICE_NAME,
      environment: config.environment,
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    mixin: traceContextFields,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'request.headers.authorization',
        'request.headers.cookie',
        'password',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
    transport: config.pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            messageKey: 'message',
            translateTime: 'SYS:standard',
            singleLine: true,
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}

export function traceContextFields(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { traceId, spanId };
}
