import type { Logger } from 'pino';
import type { DepartmentGateway } from '../../../domain/gateways/department.gateway.ts';
import { AppError } from '../../../domain/errors/app.error.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

export interface DepartmentClientConfig {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly totalTimeoutMs: number;
}

export class HttpDepartmentClient implements DepartmentGateway {
  private readonly config: DepartmentClientConfig;
  private readonly logger: Logger;

  constructor(
    config: DepartmentClientConfig,
    logger: Logger,
  ) {
    this.config = config;
    this.logger = logger;
  }

  async existsById(id: string): Promise<boolean> {
    const url = `${this.config.baseUrl}/departamentos/${encodeURIComponent(id)}`;
    const deadline = Date.now() + this.config.totalTimeoutMs;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      const remainingTimeMs = deadline - Date.now();
      if (remainingTimeMs <= 0) break;

      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(Math.min(this.config.timeoutMs, remainingTimeMs)),
        });

        if (response.status === HTTP_STATUS.NOT_FOUND) return false;
        if (response.ok) return true;
        throw new Error(`El servicio de departamentos respondió HTTP ${response.status}`);
      } catch (error) {
        this.logger.warn({ err: error, attempt, departmentId: id }, 'Department validation failed');
        if (attempt < this.config.maxAttempts) {
          const retryDelayMs = Math.min(
            this.config.retryBaseDelayMs * 2 ** (attempt - 1),
            Math.max(0, deadline - Date.now()),
          );
          if (retryDelayMs > 0) await this.delay(retryDelayMs);
        }
      }
    }

    throw new AppError(
      RESPONSE_MESSAGES.department.unavailable,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      ERROR_CODES.DEPARTMENT_SERVICE_UNAVAILABLE,
    );
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
