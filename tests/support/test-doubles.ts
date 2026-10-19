import type { Employee, EmployeeListFilters, NewEmployee } from '../../src/domain/entities/employee.entity.ts';
import type { EmployeeRepository } from '../../src/domain/repositories/employee.repository.ts';
import type { DepartmentGateway } from '../../src/domain/gateways/department.gateway.ts';
import type { DomainEvent, EventPublisher } from '../../src/domain/gateways/event-publisher.gateway.ts';

/**
 * Fake del repositorio: estado real en memoria, sin PostgreSQL. Las búsquedas por email ignoran
 * mayúsculas igual que el índice único lower(email) del schema, que se verifica aparte en la prueba
 * de integración.
 */
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly employees = new Map<string, Employee>();

  readonly calls: string[] = [];

  constructor(seed: Employee[] = []) {
    for (const employee of seed) this.employees.set(employee.id, employee);
  }

  async findAll(filters: EmployeeListFilters = {}): Promise<Employee[]> {
    return [...this.employees.values()].filter((item) => !filters.estado || item.estado === filters.estado);
  }

  async findById(id: string): Promise<Employee | undefined> {
    return this.employees.get(id);
  }

  async findByEmail(email: string): Promise<Employee | undefined> {
    return [...this.employees.values()].find((item) => item.email.toLowerCase() === email.toLowerCase());
  }

  async findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined> {
    return [...this.employees.values()].find((item) => item.numeroEmpleado === employeeNumber);
  }

  async save(employee: Employee): Promise<Employee> {
    this.calls.push(`save:${employee.id}`);
    this.employees.set(employee.id, employee);
    return employee;
  }

  async update(employee: Employee): Promise<Employee> {
    this.calls.push(`update:${employee.id}`);
    this.employees.set(employee.id, employee);
    return employee;
  }

  async retire(id: string, fechaRetiro: string): Promise<Employee> {
    this.calls.push(`retire:${id}`);
    const retired: Employee = { ...this.employees.get(id)!, estado: 'RETIRADO', fechaRetiro };
    this.employees.set(id, retired);
    return retired;
  }

  get size(): number {
    return this.employees.size;
  }
}

/** Spy del publicador de eventos: registra lo publicado en vez de hablar con RabbitMQ. */
export class RecordingEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.events.push(event as DomainEvent);
  }

  get types(): string[] {
    return this.events.map((event) => event.type);
  }
}

/** Stub del cliente HTTP a departamentos: responde según una lista fija, y cuenta las consultas. */
export class StubDepartmentGateway implements DepartmentGateway {
  private readonly existing: Set<string>;

  readonly queried: string[] = [];

  constructor(existing: string[] = ['IT']) {
    this.existing = new Set(existing);
  }

  async existsById(id: string): Promise<boolean> {
    this.queried.push(id);
    return this.existing.has(id);
  }
}

export function aNewEmployee(overrides: Partial<NewEmployee> = {}): NewEmployee {
  return {
    id: 'E001',
    nombre: 'Juan',
    apellido: 'Pérez',
    email: 'juan.perez@empresa.com',
    numeroEmpleado: 'EMP-2026-001',
    cargo: 'Desarrollador',
    area: 'Tecnología',
    departamentoId: 'IT',
    fechaIngreso: '2026-02-10',
    ...overrides,
  };
}

export function anEmployee(overrides: Partial<Employee> = {}): Employee {
  return { ...aNewEmployee(), estado: 'ACTIVO', fechaRetiro: null, ...overrides };
}
