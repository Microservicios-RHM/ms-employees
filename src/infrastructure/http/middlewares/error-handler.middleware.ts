import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../../domain/errors/app.error.ts';
import { sendError } from '../responses/api.response.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    sendError(
      res,
      HTTP_STATUS.BAD_REQUEST,
      RESPONSE_MESSAGES.validation.invalidInput,
      ERROR_CODES.VALIDATION_ERROR,
      req.originalUrl,
      error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
    return;
  }

  if (error instanceof AppError) {
    sendError(res, error.statusCode, error.message, error.code, req.originalUrl);
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    sendError(
      res,
      HTTP_STATUS.BAD_REQUEST,
      RESPONSE_MESSAGES.validation.invalidJson,
      ERROR_CODES.INVALID_JSON,
      req.originalUrl,
    );
    return;
  }

  req.log.error({ err: error }, 'Unhandled request error');
  sendError(
    res,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    RESPONSE_MESSAGES.server.internalError,
    ERROR_CODES.INTERNAL_ERROR,
    req.originalUrl,
  );
};
