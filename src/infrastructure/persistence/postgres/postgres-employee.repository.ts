import type pg from 'pg';
import type {
  Employee,
  EmployeeListFilters,
  EmployeeStatus,
} from '../../../domain/entities/employee.entity.ts';
import { AppError } from '../../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../../domain/repositories/employee.repository.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

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
  fecha_retiro: Date | null;
}

const EMPLOYEE_COLUMNS = `id, nombre, apellido, email, numero_empleado, cargo, area, departamento_id,
              TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso, estado, fecha_retiro`;

export class PostgresEmployeeRepository implements EmployeeRepository {
  private readonly pool: pg.Pool;
  private readonly table: string;

  constructor(pool: pg.Pool, schema: string) {
    this.pool = pool;
    this.table = `"${schema}"."employees"`;
  }

  async findAll(filters: EmployeeListFilters = {}): Promise<Employee[]> {
    const result = await this.pool.query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
         FROM ${this.table}
        WHERE ($1::text IS NULL OR estado = $1)
          AND ($2::date IS NULL OR fecha_retiro::date >= $2::date)
          AND ($3::date IS NULL OR fecha_retiro::date <= $3::date)
        ORDER BY id ASC`,
      [filters.estado ?? null, filters.desde ?? null, filters.hasta ?? null],
    );
    return result.rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<Employee | undefined> {
    const result = await this.pool.query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
         FROM ${this.table}
        WHERE id = $1`,
      [id],
    );
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
         RETURNING ${EMPLOYEE_COLUMNS}`,
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

  async update(employee: Employee): Promise<Employee> {
    try {
      const result = await this.pool.query<EmployeeRow>(
        `UPDATE ${this.table}
            SET nombre = $2, apellido = $3, email = $4, cargo = $5, area = $6,
                departamento_id = $7, updated_at = NOW()
          WHERE id = $1
          RETURNING ${EMPLOYEE_COLUMNS}`,
        [
          employee.id,
          employee.nombre,
          employee.apellido,
          employee.email,
          employee.cargo,
          employee.area,
          employee.departamentoId,
        ],
      );
      return this.toDomain(result.rows[0]!);
    } catch (error) {
      this.translateEmailViolation(error, employee);
      throw error;
    }
  }

  async retire(id: string, fechaRetiro: string): Promise<Employee> {
    const result = await this.pool.query<EmployeeRow>(
      `UPDATE ${this.table}
          SET estado = 'RETIRADO', fecha_retiro = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING ${EMPLOYEE_COLUMNS}`,
      [id, fechaRetiro],
    );
    return this.toDomain(result.rows[0]!);
  }

  private translateEmailViolation(error: unknown, employee: Employee): void {
    if (!(error instanceof Error) || !('code' in error) || error.code !== '23505') return;
    const constraint = 'constraint' in error ? String(error.constraint) : '';
    if (constraint.includes('email')) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmail(employee.email),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMAIL,
      );
    }
  }

  private translateUniqueViolation(error: unknown, employee: Employee): void {
    if (!(error instanceof Error) || !('code' in error) || error.code !== '23505') return;
    const constraint = 'constraint' in error ? String(error.constraint) : '';

    if (constraint.includes('email')) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmail(employee.email),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMAIL,
      );
    }
    if (constraint.includes('numero_empleado')) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmployeeNumber(employee.numeroEmpleado),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMPLOYEE_NUMBER,
      );
    }
    throw new AppError(
      RESPONSE_MESSAGES.employee.duplicateId(employee.id),
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.DUPLICATE_ID,
    );
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
      fechaRetiro: row.fecha_retiro ? row.fecha_retiro.toISOString() : null,
    };
  }
}
