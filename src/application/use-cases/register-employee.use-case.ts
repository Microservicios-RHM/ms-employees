import type { Employee, NewEmployee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';

export class RegisterEmployee {
  private readonly repository: EmployeeRepository;

  constructor(repository: EmployeeRepository) {
    this.repository = repository;
  }

  async execute(input: NewEmployee): Promise<Employee> {
    const employee: Employee = {
      ...input,
      id: input.id.trim(),
      email: input.email.trim().toLowerCase(),
      numeroEmpleado: input.numeroEmpleado.trim(),
    };

    if (await this.repository.findById(employee.id)) {
      throw new AppError(`El empleado con id ${employee.id} ya existe`, 400, 'DUPLICATE_ID');
    }
    if (await this.repository.findByEmail(employee.email)) {
      throw new AppError(`El email ${employee.email} ya está registrado`, 400, 'DUPLICATE_EMAIL');
    }
    if (await this.repository.findByEmployeeNumber(employee.numeroEmpleado)) {
      throw new AppError(
        `El número de empleado ${employee.numeroEmpleado} ya está registrado`,
        400,
        'DUPLICATE_EMPLOYEE_NUMBER',
      );
    }

    return this.repository.save(employee);
  }
}
