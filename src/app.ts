import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { RegisterEmployee } from './application/use-cases/register-employee.use-case.ts';
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

export function createApp(
  repository: EmployeeRepository,
  departmentGateway: DepartmentGateway,
  logger: Logger,
) {
  const app = express();
  const registerEmployee = new RegisterEmployee(repository, departmentGateway);
  const getEmployeeById = new GetEmployeeById(repository);
  const listEmployees = new ListEmployees(repository);

  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use('/', documentationRouter);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use('/', healthRouter);
  app.use('/empleados', createEmployeeRouter(registerEmployee, getEmployeeById, listEmployees));

  app.use((_req, res) => {
    sendError(
      res,
      HTTP_STATUS.NOT_FOUND,
      RESPONSE_MESSAGES.resource.notFound,
      ERROR_CODES.RESOURCE_NOT_FOUND,
    );
  });
  app.use(errorHandler);

  return app;
}
