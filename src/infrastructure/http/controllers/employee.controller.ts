import type { NextFunction, Request, Response } from 'express';
import type { GetEmployeeById } from '../../../application/use-cases/get-employee-by-id.use-case.ts';
import type { RegisterEmployee } from '../../../application/use-cases/register-employee.use-case.ts';
import type { UpdateEmployee } from '../../../application/use-cases/update-employee.use-case.ts';
import type { RetireEmployee } from '../../../application/use-cases/retire-employee.use-case.ts';
import type { ListEmployees } from '../../../application/use-cases/list-employees.use-case.ts';
import {
  createEmployeeSchema,
  employeeIdSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} from '../schemas/employee.schema.ts';
import { sendSuccess } from '../responses/api.response.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

export class EmployeeController {
  private readonly registerEmployee: RegisterEmployee;
  private readonly updateEmployee: UpdateEmployee;
  private readonly retireEmployee: RetireEmployee;
  private readonly getEmployeeById: GetEmployeeById;
  private readonly listEmployees: ListEmployees;

  constructor(
    registerEmployee: RegisterEmployee,
    updateEmployee: UpdateEmployee,
    retireEmployee: RetireEmployee,
    getEmployeeById: GetEmployeeById,
    listEmployees: ListEmployees,
  ) {
    this.registerEmployee = registerEmployee;
    this.updateEmployee = updateEmployee;
    this.retireEmployee = retireEmployee;
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

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = employeeIdSchema.parse(req.params.id);
      const input = updateEmployeeSchema.parse(req.body);
      const employee = await this.updateEmployee.execute(id, input);
      sendSuccess(res, HTTP_STATUS.OK, RESPONSE_MESSAGES.employee.updated, employee);
    } catch (error) {
      next(error);
    }
  };

  retire = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = employeeIdSchema.parse(req.params.id);
      const employee = await this.retireEmployee.execute(id);
      sendSuccess(res, HTTP_STATUS.OK, RESPONSE_MESSAGES.employee.retired, employee);
    } catch (error) {
      next(error);
    }
  };

  findAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = listEmployeesQuerySchema.parse(req.query);
      const employees = await this.listEmployees.execute(filters);
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
