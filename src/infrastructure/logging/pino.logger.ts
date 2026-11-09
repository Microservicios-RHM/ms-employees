import pino, { type Logger } from 'pino';
import { context, trace } from '@opentelemetry/api';
import type { LoggingConfig } from '../../config/environment.config.ts';

export function createLogger(config: LoggingConfig): Logger {
  return pino({
    level: config.level,
    messageKey: 'message',
    base: {
      service: 'empleados-service',
      environment: config.environment,
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ level: label }) },
    mixin: () => ({ context: {}, traceId: trace.getSpan(context.active())?.spanContext().traceId ?? null }),
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
            translateTime: 'SYS:standard',
            singleLine: true,
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}
