import type { NextFunction, Request, Response } from 'express';
import type { GetEmployeeById } from '../../../application/use-cases/get-employee-by-id.use-case.ts';
import type { RegisterEmployee } from '../../../application/use-cases/register-employee.use-case.ts';
import type { ListEmployees } from '../../../application/use-cases/list-employees.use-case.ts';
import { createEmployeeSchema, employeeIdSchema } from '../schemas/employee.schema.ts';
import { sendSuccess } from '../responses/api.response.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

export class EmployeeController {
  private readonly registerEmployee: RegisterEmployee;
  private readonly getEmployeeById: GetEmployeeById;
  private readonly listEmployees: ListEmployees;

  constructor(
    registerEmployee: RegisterEmployee,
    getEmployeeById: GetEmployeeById,
    listEmployees: ListEmployees,
  ) {
    this.registerEmployee = registerEmployee;
    this.getEmployeeById = getEmployeeById;
    this.listEmployees = listEmployees;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createEmployeeSchema.parse(req.body);
      const employee = await this.registerEmployee.execute(input);
      res.location(`/empleados/${encodeURIComponent(employee.id)}`);
      sendSuccess(res, HTTP_STATUS.CREATED, RESPONSE_MESSAGES.employee.registered, employee);
    } catch (error) {
      next(error);
    }
  };

  findAll = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employees = await this.listEmployees.execute();
      sendSuccess(res, HTTP_STATUS.OK, RESPONSE_MESSAGES.employee.listed, employees);
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = employeeIdSchema.parse(req.params.id);
      const employee = await this.getEmployeeById.execute(id);
      sendSuccess(res, HTTP_STATUS.OK, RESPONSE_MESSAGES.employee.retrieved, employee);
    } catch (error) {
      next(error);
    }
  };
}
