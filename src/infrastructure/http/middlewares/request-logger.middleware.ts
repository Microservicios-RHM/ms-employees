import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
    genReqId: (req, res) => {
      const incomingId = req.headers['x-request-id'];
      const requestId =
        typeof incomingId === 'string' && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomUUID();
      res.setHeader('X-Request-Id', requestId);
      return requestId;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url ?? '/'} completed with status ${res.statusCode}`,
    customErrorMessage: (req, res) =>
      `${req.method} ${req.url ?? '/'} failed with status ${res.statusCode}`,
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}
