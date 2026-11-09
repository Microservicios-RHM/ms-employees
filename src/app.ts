import express from 'express';
import helmet from 'helmet';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { context, propagation, SpanKind, trace } from '@opentelemetry/api';
import type { Logger } from 'pino';
import { RegisterEmployee } from './application/use-cases/register-employee.use-case.ts';
import { UpdateEmployee } from './application/use-cases/update-employee.use-case.ts';
import { RetireEmployee } from './application/use-cases/retire-employee.use-case.ts';
import { GetEmployeeById } from './application/use-cases/get-employee-by-id.use-case.ts';
import { ListEmployees } from './application/use-cases/list-employees.use-case.ts';
import type { EmployeeRepository } from './domain/repositories/employee.repository.ts';
import { createEmployeeRouter } from './infrastructure/http/routes/employee.routes.ts';
import { createHealthRouter, type HealthCheck } from './infrastructure/http/routes/health.routes.ts';
import { errorHandler } from './infrastructure/http/middlewares/error-handler.middleware.ts';
import documentationRouter from './infrastructure/http/routes/documentation.routes.ts';
import { createRequestLogger } from './infrastructure/http/middlewares/request-logger.middleware.ts';
import { sendError } from './infrastructure/http/responses/api.response.ts';
import { HTTP_STATUS } from './shared/constants/http-status.constants.ts';
import { ERROR_CODES } from './shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from './shared/constants/response-messages.constants.ts';
import type { DepartmentGateway } from './domain/gateways/department.gateway.ts';
import type { EventPublisher } from './domain/gateways/event-publisher.gateway.ts';
import type {
  DepartmentCatalogCacheManager,
  DepartmentResilienceMetricsProvider,
} from './infrastructure/http/clients/http-department.client.ts';
import { createDepartmentCacheRouter } from './infrastructure/http/routes/department-cache.routes.ts';

export function createApp(
  repository: EmployeeRepository,
  departmentGateway: DepartmentGateway,
  eventPublisher: EventPublisher,
  logger: Logger,
  cacheManager?: DepartmentCatalogCacheManager,
  cacheAdminToken?: string,
  healthCheck: HealthCheck = async () => ({ application: 'UP' }),
) {
  const app = express();
  const metricsRegistry = new Registry();
  collectDefaultMetrics({ register: metricsRegistry, prefix: 'rhm_employees_' });
  const httpRequests = new Counter({
    name: 'rhm_http_requests_total',
    help: 'Total HTTP requests handled by empleados-service',
    labelNames: ['service', 'method', 'status'] as const,
    registers: [metricsRegistry],
  });
  const httpDuration = new Histogram({ name: 'rhm_http_request_duration_seconds', help: 'HTTP request duration in seconds', labelNames: ['service', 'method', 'status'] as const, registers: [metricsRegistry] });
  const registerEmployee = new RegisterEmployee(repository, departmentGateway, eventPublisher);
  const updateEmployee = new UpdateEmployee(repository, departmentGateway, eventPublisher);
  const retireEmployee = new RetireEmployee(repository, eventPublisher);
  const getEmployeeById = new GetEmployeeById(repository);
  const listEmployees = new ListEmployees(repository);

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const extractedContext = propagation.extract(context.active(), request.headers);
    trace.getTracer('empleados-service').startActiveSpan(
      `${request.method} ${request.path}`,
      { kind: SpanKind.SERVER, attributes: { 'http.request.method': request.method, 'url.path': request.path } },
      extractedContext,
      (span) => {
        response.on('finish', () => {
          span.setAttribute('http.response.status_code', response.statusCode);
          span.end();
        });
        next();
      },
    );
  });
  app.use((request, response, next) => {
    const end = httpDuration.startTimer({ service: 'empleados-service', method: request.method });
    response.on('finish', () => { const status = String(response.statusCode); httpRequests.inc({ service: 'empleados-service', method: request.method, status }); end({ status }); });
    next();
  });
  app.get('/metrics', async (_request, response) => {
    response.setHeader('Content-Type', metricsRegistry.contentType);
    const metrics = [await metricsRegistry.metrics()];
    if (isDepartmentResilienceMetricsProvider(cacheManager)) {
      metrics.push(await cacheManager.getResilienceMetrics());
    }
    response.send(metrics.join('\n'));
  });
  app.use(createRequestLogger(logger));
  app.use('/', documentationRouter);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.use('/', createHealthRouter(healthCheck));
  app.use(
    '/empleados',
    createEmployeeRouter(
      registerEmployee,
      updateEmployee,
      retireEmployee,
      getEmployeeById,
      listEmployees,
    ),
  );
  if (cacheManager && cacheAdminToken) {
    app.use('/empleados', createDepartmentCacheRouter(cacheManager, cacheAdminToken));
  }

  app.use((_req, res) => {
    sendError(
      res,
      HTTP_STATUS.NOT_FOUND,
      RESPONSE_MESSAGES.resource.notFound,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      _req.originalUrl,
    );
  });
  app.use(errorHandler);

  return app;
}

function isDepartmentResilienceMetricsProvider(
  cacheManager: DepartmentCatalogCacheManager | undefined,
): cacheManager is DepartmentCatalogCacheManager & DepartmentResilienceMetricsProvider {
  return typeof (cacheManager as Partial<DepartmentResilienceMetricsProvider> | undefined)
    ?.getResilienceMetrics === 'function';
}
