import type { Logger } from 'pino';
import CircuitBreaker from 'opossum';
import NodeCache from 'node-cache';
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
  readonly cacheTtlSeconds: number;
}

export interface DepartmentCatalogCacheManager {
  warmUpCatalog(): Promise<void>;
  clearCatalog(): number;
}

export class HttpDepartmentClient implements DepartmentGateway, DepartmentCatalogCacheManager {
  private static readonly catalogCacheKey = 'departments:catalog';
  private readonly config: DepartmentClientConfig;
  private readonly logger: Logger;
  private readonly circuitBreaker: CircuitBreaker<[string], boolean>;
  private readonly cache: NodeCache;

  constructor(
    config: DepartmentClientConfig,
    logger: Logger,
    cache = new NodeCache({ stdTTL: config.cacheTtlSeconds, useClones: false }),
  ) {
    this.config = config;
    this.logger = logger;
    this.cache = cache;
    this.circuitBreaker = new CircuitBreaker(
      (id: string) => this.executeDepartmentValidation(id),
      {
        name: 'department-validation',
        timeout: false,
        volumeThreshold: this.config.circuitBreakerThreshold,
        errorThresholdPercentage: 50,
        rollingCountTimeout: 60_000,
        rollingCountBuckets: 10,
        resetTimeout: this.config.circuitBreakerResetTimeoutMs,
      },
    );
    this.registerCircuitBreakerLogging();
  }

  async existsById(id: string): Promise<boolean> {
    try {
      const exists = await this.circuitBreaker.fire(id);
      if (exists) await this.refreshCatalogIfMissing();
      return exists;
    } catch (error) {
      if (this.isCircuitOpenError(error) || this.isDepartmentServiceUnavailableError(error)) {
        if (this.isDepartmentCached(id)) {
          this.logger.warn(
            { departmentId: id },
            'Department validation served from cache because the service is unavailable',
          );
          return true;
        }

        this.logger.warn(
          { departmentId: id },
          'Department validation fallback cache miss because the service is unavailable',
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
    return this.validateDepartment(id);
  }

  async warmUpCatalog(): Promise<void> {
    try {
      await this.refreshCatalog();
    } catch (error) {
      this.logger.warn({ err: error }, 'Department catalog cache warm-up failed');
    }
  }

  clearCatalog(): number {
    const removed = this.cache.del(HttpDepartmentClient.catalogCacheKey);
    this.logger.info({ removed }, 'Department catalog cache cleared');
    return removed;
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

  private isDepartmentServiceUnavailableError(error: unknown): boolean {
    return error instanceof AppError && error.code === ERROR_CODES.DEPARTMENT_SERVICE_UNAVAILABLE;
  }

  private async refreshCatalog(): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/departamentos`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`Department catalog returned HTTP ${response.status}`);

    const payload: unknown = await response.json();
    const departmentIds = this.extractDepartmentIds(payload);
    this.cache.set(HttpDepartmentClient.catalogCacheKey, departmentIds);
    this.logger.info(
      { departments: departmentIds.length, ttlSeconds: this.config.cacheTtlSeconds },
      'Department catalog cache refreshed',
    );
  }

  private async refreshCatalogIfMissing(): Promise<void> {
    if (this.cache.has(HttpDepartmentClient.catalogCacheKey)) return;

    try {
      await this.refreshCatalog();
    } catch (error) {
      this.logger.warn({ err: error }, 'Department catalog refresh failed after successful validation');
    }
  }

  private isDepartmentCached(id: string): boolean {
    const departmentIds = this.cache.get<readonly string[]>(HttpDepartmentClient.catalogCacheKey);
    return departmentIds?.includes(id) ?? false;
  }

  private extractDepartmentIds(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
      throw new Error('Department catalog response has an invalid format');
    }

    return payload.data.flatMap((department) => (
      department && typeof department === 'object' && 'id' in department && typeof department.id === 'string'
        ? [department.id]
        : []
    ));
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
