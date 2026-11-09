/**
 * Health Check API (Reto 8). GET /health verifica de verdad las dependencias del servicio, en
 * vez de responder siempre "UP" (antipatrón "health check vacío"):
 *
 *   200 {"status":"UP","service":"empleados-service","checks":{"database":"UP","messageBroker":"UP"}}
 *   503 {"status":"DOWN", ... "checks":{"database":"DOWN", ...}}
 *
 * Cada chequeo tiene un tiempo límite corto: un health check lento degrada al propio servicio y
 * hace que el healthcheck de Docker lo marque unhealthy por timeout, no por la dependencia.
 */
import type { Request, RequestHandler, Response } from 'express';

export type HealthStatus = 'UP' | 'DOWN';
export type HealthCheck = () => Promise<boolean> | boolean;

export interface HealthReport {
  readonly status: HealthStatus;
  readonly service: string;
  readonly checks: Record<string, HealthStatus>;
}

const DEFAULT_CHECK_TIMEOUT_MS = 2_000;

export async function evaluateHealth(
  service: string,
  checks: Record<string, HealthCheck>,
  timeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      const healthy = await withTimeout(Promise.resolve().then(check), timeoutMs).catch(() => false);
      return [name, healthy ? 'UP' : 'DOWN'] as const;
    }),
  );
  const results = Object.fromEntries(entries) as Record<string, HealthStatus>;
  const status: HealthStatus = Object.values(results).every((value) => value === 'UP') ? 'UP' : 'DOWN';
  return { status, service, checks: results };
}

export function createHealthHandler(service: string, checks: Record<string, HealthCheck>): RequestHandler {
  return async (_req: Request, res: Response) => {
    const report = await evaluateHealth(service, checks);
    res.status(report.status === 'UP' ? 200 : 503).json(report);
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Health check timed out')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
