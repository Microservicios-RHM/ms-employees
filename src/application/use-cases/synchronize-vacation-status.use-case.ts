import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';

export class SynchronizeVacationStatus {
  private readonly repository: EmployeeRepository;

  constructor(repository: EmployeeRepository) {
    this.repository = repository;
  }

  async started(employeeId: string): Promise<void> {
    await this.repository.updateStatus(employeeId, 'EN_VACACIONES');
  }

  async finished(employeeId: string): Promise<void> {
    await this.repository.updateStatus(employeeId, 'ACTIVO');
  }
}
