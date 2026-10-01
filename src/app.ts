import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { RegisterEmployee } from './application/use-cases/register-employee.use-case.ts';
import { UpdateEmployee } from './application/use-cases/update-employee.use-case.ts';
import { RetireEmployee } from './application/use-cases/retire-employee.use-case.ts';
import { GetEmployeeById } from './application/use-cases/get-employee-by-id.use-case.ts';
import { ListEmployees } from './application/use-cases/list-employees.use-case.ts';
import type { EmployeeRepository } from './domain/repositories/employee.repository.ts';
import { createEmployeeRouter } from './infrastructure/http/routes/employee.routes.ts';
import healthRouter from './infrastructure/http/routes/health.routes.ts';
import { errorHandler } from './infrastructure/http/middlewares/error-handler.middleware.ts';
import documentationRouter from './infrastructure/http/routes/documentation.routes.ts';
import { createRequestLogger } from './infrastructure/http/middlewares/request-logger.middleware.ts';
import { sendError } from './infrastructure/http/responses/api.response.ts';
import { HTTP_STATUS } from './shared/constants/http-status.constants.ts';
import { ERROR_CODES } from './shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from './shared/constants/response-messages.constants.ts';
import type { DepartmentGateway } from './domain/gateways/department.gateway.ts';
import type { EventPublisher } from './domain/gateways/event-publisher.gateway.ts';
import type { DepartmentCatalogCacheManager } from './infrastructure/http/clients/http-department.client.ts';
import { createDepartmentCacheRouter } from './infrastructure/http/routes/department-cache.routes.ts';

export function createApp(
  repository: EmployeeRepository,
  departmentGateway: DepartmentGateway,
  eventPublisher: EventPublisher,
  logger: Logger,
  cacheManager?: DepartmentCatalogCacheManager,
  cacheAdminToken?: string,
) {
  const app = express();
  const registerEmployee = new RegisterEmployee(repository, departmentGateway, eventPublisher);
  const updateEmployee = new UpdateEmployee(repository, departmentGateway, eventPublisher);
  const retireEmployee = new RetireEmployee(repository, eventPublisher);
  const getEmployeeById = new GetEmployeeById(repository);
  const listEmployees = new ListEmployees(repository);

  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use('/', documentationRouter);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.use('/', healthRouter);
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
