import { Router } from 'express';
import type { GetEmployeeById } from '../../../application/use-cases/get-employee-by-id.use-case.ts';
import type { RegisterEmployee } from '../../../application/use-cases/register-employee.use-case.ts';
import { EmployeeController } from '../controllers/employee.controller.ts';

export function createEmployeeRouter(
  registerEmployee: RegisterEmployee,
  getEmployeeById: GetEmployeeById,
): Router {
  const router = Router();
  const controller = new EmployeeController(registerEmployee, getEmployeeById);

  router.post('/', controller.register);
  router.get('/:id', controller.findById);

  return router;
}
