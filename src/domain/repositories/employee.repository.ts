import type { Employee, EmployeeListFilters, EmployeeStatus } from '../entities/employee.entity.ts';

export interface EmployeeRepository {
  findAll(filters?: EmployeeListFilters): Promise<Employee[]>;
  findById(id: string): Promise<Employee | undefined>;
  findByEmail(email: string): Promise<Employee | undefined>;
  findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined>;
  save(employee: Employee): Promise<Employee>;
  update(employee: Employee): Promise<Employee>;
  updateStatus(id: string, status: EmployeeStatus): Promise<Employee | undefined>;
  retire(id: string, fechaRetiro: string): Promise<Employee>;
}
