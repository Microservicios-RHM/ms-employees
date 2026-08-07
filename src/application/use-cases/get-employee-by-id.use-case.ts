import type { Employee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';

export class GetEmployeeById {
  private readonly repository: EmployeeRepository;

  constructor(repository: EmployeeRepository) {
    this.repository = repository;
  }

  async execute(id: string): Promise<Employee> {
    const employee = await this.repository.findById(id);
    if (!employee) {
      throw new AppError(`El empleado con id ${id} no existe`, 404, 'EMPLOYEE_NOT_FOUND');
    }
    return employee;
  }
}
