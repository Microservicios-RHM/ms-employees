import type { Employee, NewEmployee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';
import type { DepartmentGateway } from '../../domain/gateways/department.gateway.ts';
import { HTTP_STATUS } from '../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../shared/constants/response-messages.constants.ts';

export class RegisterEmployee {
  private readonly repository: EmployeeRepository;

  private readonly departmentGateway: DepartmentGateway;

  constructor(repository: EmployeeRepository, departmentGateway: DepartmentGateway) {
    this.repository = repository;
    this.departmentGateway = departmentGateway;
  }

  async execute(input: NewEmployee): Promise<Employee> {
    const employee: Employee = {
      ...input,
      id: input.id.trim(),
      email: input.email.trim().toLowerCase(),
      numeroEmpleado: input.numeroEmpleado.trim(),
      estado: 'ACTIVO',
    };

    if (await this.repository.findByEmail(employee.email)) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmail(employee.email),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMAIL,
      );
    }
    if (await this.repository.findByEmployeeNumber(employee.numeroEmpleado)) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmployeeNumber(employee.numeroEmpleado),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMPLOYEE_NUMBER,
      );
    }

    if (!(await this.departmentGateway.existsById(employee.departamentoId))) {
      throw new AppError(
        RESPONSE_MESSAGES.department.notFound(employee.departamentoId),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DEPARTMENT_NOT_FOUND,
      );
    }

    if (await this.repository.findById(employee.id)) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateId(employee.id),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_ID,
      );
    }

    return this.repository.save(employee);
  }
}
