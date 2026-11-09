import { Router } from 'express';
import { createHealthHandler, type HealthCheck } from '../../observability/health.ts';

/**
 * GET /health (Reto 8): estado real del servicio y de sus dependencias, 200 si todo está UP y 503
 * si alguna está DOWN. Lo consultan el healthcheck de Docker y el panel de estado de Grafana.
 */
export function createHealthRouter(service: string, checks: Record<string, HealthCheck>): Router {
  const healthRouter = Router();
  healthRouter.get('/health', createHealthHandler(service, checks));
  return healthRouter;
}
