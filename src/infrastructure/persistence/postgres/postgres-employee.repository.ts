import type pg from 'pg';
import type { Employee, EmployeeStatus } from '../../../domain/entities/employee.entity.ts';
import { AppError } from '../../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../../domain/repositories/employee.repository.ts';

interface EmployeeRow {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  numero_empleado: string;
  cargo: string;
  area: string;
  departamento_id: string;
  fecha_ingreso: string;
  estado: EmployeeStatus;
}

export class PostgresEmployeeRepository implements EmployeeRepository {
  private readonly pool: pg.Pool;
  private readonly table: string;

  constructor(pool: pg.Pool, schema: string) {
    this.pool = pool;
    this.table = `"${schema}"."employees"`;
  }

  async findById(id: string): Promise<Employee | undefined> {
    const result = await this.pool.query<EmployeeRow>(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    return result.rows[0] ? this.toDomain(result.rows[0]) : undefined;
  }

  async findByEmail(email: string): Promise<Employee | undefined> {
    const result = await this.pool.query<EmployeeRow>(
      `SELECT * FROM ${this.table} WHERE lower(email) = lower($1)`,
      [email],
    );
    return result.rows[0] ? this.toDomain(result.rows[0]) : undefined;
  }

  async findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined> {
    const result = await this.pool.query<EmployeeRow>(
      `SELECT * FROM ${this.table} WHERE numero_empleado = $1`,
      [employeeNumber],
    );
    return result.rows[0] ? this.toDomain(result.rows[0]) : undefined;
  }

  async save(employee: Employee): Promise<Employee> {
    try {
      const result = await this.pool.query<EmployeeRow>(
        `INSERT INTO ${this.table}
          (id, nombre, apellido, email, numero_empleado, cargo, area, departamento_id, fecha_ingreso, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          employee.id,
          employee.nombre,
          employee.apellido,
          employee.email,
          employee.numeroEmpleado,
          employee.cargo,
          employee.area,
          employee.departamentoId,
          employee.fechaIngreso,
          employee.estado,
        ],
      );
      return this.toDomain(result.rows[0]!);
    } catch (error) {
      this.translateUniqueViolation(error, employee);
      throw error;
    }
  }

  private translateUniqueViolation(error: unknown, employee: Employee): void {
    if (!(error instanceof Error) || !('code' in error) || error.code !== '23505') return;
    const constraint = 'constraint' in error ? String(error.constraint) : '';

    if (constraint.includes('email')) {
      throw new AppError(`El email ${employee.email} ya está registrado`, 400, 'DUPLICATE_EMAIL');
    }
    if (constraint.includes('numero_empleado')) {
      throw new AppError(
        `El número de empleado ${employee.numeroEmpleado} ya está registrado`,
        400,
        'DUPLICATE_EMPLOYEE_NUMBER',
      );
    }
    throw new AppError(`El empleado con id ${employee.id} ya existe`, 400, 'DUPLICATE_ID');
  }

  private toDomain(row: EmployeeRow): Employee {
    return {
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      numeroEmpleado: row.numero_empleado,
      cargo: row.cargo,
      area: row.area,
      departamentoId: row.departamento_id,
      fechaIngreso: row.fecha_ingreso,
      estado: row.estado,
    };
  }
}
