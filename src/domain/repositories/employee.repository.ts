import type { Employee } from '../entities/employee.entity.ts';

export interface EmployeeRepository {
  findById(id: string): Promise<Employee | undefined>;
  findByEmail(email: string): Promise<Employee | undefined>;
  findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined>;
  save(employee: Employee): Promise<Employee>;
}
