import { Router } from 'express';
import type { GetEmployeeById } from '../../../application/use-cases/get-employee-by-id.use-case.ts';
import type { RegisterEmployee } from '../../../application/use-cases/register-employee.use-case.ts';
import type { UpdateEmployee } from '../../../application/use-cases/update-employee.use-case.ts';
import type { RetireEmployee } from '../../../application/use-cases/retire-employee.use-case.ts';
import type { ListEmployees } from '../../../application/use-cases/list-employees.use-case.ts';
import { EmployeeController } from '../controllers/employee.controller.ts';

export function createEmployeeRouter(
  registerEmployee: RegisterEmployee,
  updateEmployee: UpdateEmployee,
  retireEmployee: RetireEmployee,
  getEmployeeById: GetEmployeeById,
  listEmployees: ListEmployees,
): Router {
  const router = Router();
  const controller = new EmployeeController(
    registerEmployee,
    updateEmployee,
    retireEmployee,
    getEmployeeById,
    listEmployees,
  );

  router.post('/', controller.register);
  router.get('/', controller.findAll);
  router.get('/:id', controller.findById);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.retire);

  return router;
}
