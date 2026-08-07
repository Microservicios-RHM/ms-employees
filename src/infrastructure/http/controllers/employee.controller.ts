import type { NextFunction, Request, Response } from 'express';
import type { GetEmployeeById } from '../../../application/use-cases/get-employee-by-id.ts';
import type { RegisterEmployee } from '../../../application/use-cases/register-employee.ts';
import { createEmployeeSchema, employeeIdSchema } from '../schemas/employee.schema.ts';

export class EmployeeController {
  private readonly registerEmployee: RegisterEmployee;
  private readonly getEmployeeById: GetEmployeeById;

  constructor(registerEmployee: RegisterEmployee, getEmployeeById: GetEmployeeById) {
    this.registerEmployee = registerEmployee;
    this.getEmployeeById = getEmployeeById;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createEmployeeSchema.parse(req.body);
      const employee = await this.registerEmployee.execute(input);
      res.status(200).json(employee);
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = employeeIdSchema.parse(req.params.id);
      const employee = await this.getEmployeeById.execute(id);
      res.status(200).json(employee);
    } catch (error) {
      next(error);
    }
  };
}
