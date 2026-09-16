import type { Employee } from '../../domain/entities/employee.entity.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';

export class ListEmployees {
  private readonly repository: EmployeeRepository;

  constructor(repository: EmployeeRepository) {
    this.repository = repository;
  }

  execute(): Promise<Employee[]> {
    return this.repository.findAll();
  }
}
