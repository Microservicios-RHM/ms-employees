import type { ErrorCode } from '../../shared/constants/error-codes.constants.ts';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
