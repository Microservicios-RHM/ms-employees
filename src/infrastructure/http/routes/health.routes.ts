import { Router } from 'express';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';

export type HealthCheck = () => Promise<Record<string, 'UP' | 'DOWN'>>;

export function createHealthRouter(check: HealthCheck): Router {
  const healthRouter = Router();
  healthRouter.get('/health', async (_req, res) => {
    const checks = await check();
    const status = Object.values(checks).every((value) => value === 'UP') ? 'UP' : 'DOWN';
    res.status(status === 'UP' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status,
      service: 'empleados-service',
      checks,
    });
  });
  return healthRouter;
}

