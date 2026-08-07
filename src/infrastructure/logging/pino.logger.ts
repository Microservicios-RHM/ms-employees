import pino, { type Logger } from 'pino';
import type { LoggingConfig } from '../../config/environment.config.ts';

export function createLogger(config: LoggingConfig): Logger {
  return pino({
    level: config.level,
    base: {
      service: 'ms-employees',
      environment: config.environment,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
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
