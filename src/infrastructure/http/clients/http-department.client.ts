import type { Logger } from 'pino';
import CircuitBreaker from 'opossum';
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
  readonly circuitBreakerThreshold: number;
  readonly circuitBreakerResetTimeoutMs: number;
}

export class HttpDepartmentClient implements DepartmentGateway {
  private readonly config: DepartmentClientConfig;
  private readonly logger: Logger;
  private readonly circuitBreaker: CircuitBreaker<[string], boolean>;
  private consecutiveFailures = 0;

  constructor(
    config: DepartmentClientConfig,
    logger: Logger,
  ) {
    this.config = config;
    this.logger = logger;
    this.circuitBreaker = new CircuitBreaker(
      (id: string) => this.executeDepartmentValidation(id),
      {
        name: 'department-validation',
        timeout: false,
        volumeThreshold: Number.MAX_SAFE_INTEGER,
        errorThresholdPercentage: 100,
        resetTimeout: this.config.circuitBreakerResetTimeoutMs,
      },
    );
    this.registerCircuitBreakerLogging();
  }

  async existsById(id: string): Promise<boolean> {
    try {
      return await this.circuitBreaker.fire(id);
    } catch (error) {
      if (this.isCircuitOpenError(error)) {
        this.logger.warn(
          { departmentId: id },
          'Department validation fallback executed because the circuit is OPEN',
        );
        throw this.departmentServiceUnavailableError();
      }
      throw error;
    }
  }

  private async validateDepartment(id: string): Promise<boolean> {
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

    throw this.departmentServiceUnavailableError();
  }

  private async executeDepartmentValidation(id: string): Promise<boolean> {
    try {
      const result = await this.validateDepartment(id);
      this.consecutiveFailures = 0;
      return result;
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        this.circuitBreaker.open();
      }
      throw error;
    }
  }

  private departmentServiceUnavailableError(): AppError {
    return new AppError(
      RESPONSE_MESSAGES.department.unavailable,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      ERROR_CODES.DEPARTMENT_SERVICE_UNAVAILABLE,
    );
  }

  private isCircuitOpenError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'EOPENBREAKER';
  }

  private registerCircuitBreakerLogging(): void {
    this.circuitBreaker.on('open', () => {
      this.logger.warn('Department validation circuit breaker OPEN');
    });
    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info('Department validation circuit breaker HALF_OPEN');
    });
    this.circuitBreaker.on('close', () => {
      this.logger.info('Department validation circuit breaker CLOSED');
    });
    this.circuitBreaker.on('success', (_result, latencyMs) => {
      this.logger.info({ latencyMs }, 'Department validation circuit breaker call succeeded');
    });
    this.circuitBreaker.on('failure', (error, latencyMs) => {
      this.logger.warn({ err: error, latencyMs }, 'Department validation circuit breaker call failed');
    });
    this.circuitBreaker.on('reject', (error) => {
      this.logger.warn({ err: error }, 'Department validation rejected because the circuit is OPEN');
    });
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
