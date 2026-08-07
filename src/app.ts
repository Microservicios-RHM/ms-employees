import express from 'express';
import helmet from 'helmet';
import { RegisterEmployee } from './application/use-cases/register-employee.use-case.ts';
import { GetEmployeeById } from './application/use-cases/get-employee-by-id.use-case.ts';
import type { EmployeeRepository } from './domain/repositories/employee.repository.ts';
import { createEmployeeRouter } from './infrastructure/http/routes/employee.routes.ts';
import healthRouter from './infrastructure/http/routes/health.routes.ts';
import { errorHandler } from './infrastructure/http/middlewares/error-handler.middleware.ts';

export function createApp(repository: EmployeeRepository) {
  const app = express();
  const registerEmployee = new RegisterEmployee(repository);
  const getEmployeeById = new GetEmployeeById(repository);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use('/', healthRouter);
  app.use('/empleados', createEmployeeRouter(registerEmployee, getEmployeeById));

  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Recurso no encontrado');
  });
  app.use(errorHandler);

  return app;
}
