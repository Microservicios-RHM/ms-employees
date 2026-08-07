import type { Response } from 'express';
import type { ErrorCode } from '../../../shared/constants/error-codes.constants.ts';

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly message: string;
  readonly data: T;
}

export interface ApiErrorDetail {
  readonly field: string;
  readonly message: string;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly message: string;
  readonly data: null;
  readonly error: {
    readonly code: ErrorCode;
    readonly details?: readonly ApiErrorDetail[];
  };
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T,
): Response<ApiSuccessResponse<T>> {
  return res.status(statusCode).json({ success: true, message, data });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: ErrorCode,
  details?: readonly ApiErrorDetail[],
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: {
      code,
      ...(details ? { details } : {}),
    },
  });
}
