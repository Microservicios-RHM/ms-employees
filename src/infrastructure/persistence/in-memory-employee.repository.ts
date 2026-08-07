import type { Employee } from '../../domain/entities/employee.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';

export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly employees = new Map<string, Employee>();

  async findById(id: string): Promise<Employee | undefined> {
    return this.clone(this.employees.get(id));
  }

  async findByEmail(email: string): Promise<Employee | undefined> {
    const normalizedEmail = email.toLowerCase();
    return this.clone([...this.employees.values()].find((employee) => employee.email === normalizedEmail));
  }

  async findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined> {
    return this.clone(
      [...this.employees.values()].find((employee) => employee.numeroEmpleado === employeeNumber),
    );
  }

  async save(employee: Employee): Promise<Employee> {
    const storedEmployee = Object.freeze({ ...employee });
    this.employees.set(storedEmployee.id, storedEmployee);
    return { ...storedEmployee };
  }

  private clone(employee: Employee | undefined): Employee | undefined {
    return employee ? { ...employee } : undefined;
  }
}
