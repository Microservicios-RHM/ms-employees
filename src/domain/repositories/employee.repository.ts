import type { Employee, EmployeeListFilters } from '../entities/employee.entity.ts';

export interface EmployeeRepository {
  findAll(filters?: EmployeeListFilters): Promise<Employee[]>;
  findById(id: string): Promise<Employee | undefined>;
  findByEmail(email: string): Promise<Employee | undefined>;
  findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined>;
  save(employee: Employee): Promise<Employee>;
  update(employee: Employee): Promise<Employee>;
  retire(id: string, fechaRetiro: string): Promise<Employee>;
}
