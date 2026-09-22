import type { Employee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';
import { HTTP_STATUS } from '../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../shared/constants/response-messages.constants.ts';

export class GetEmployeeById {
  private readonly repository: EmployeeRepository;

  constructor(repository: EmployeeRepository) {
    this.repository = repository;
  }

  async execute(id: string): Promise<Employee> {
    const employee = await this.repository.findById(id);
    if (!employee) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.notFound(id),
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.EMPLOYEE_NOT_FOUND,
      );
    }
    return employee;
  }
}
