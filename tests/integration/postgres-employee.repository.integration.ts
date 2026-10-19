import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgresEmployeeRepository } from '../../src/infrastructure/persistence/postgres/postgres-employee.repository.ts';
import { runMigrations } from '../../src/infrastructure/persistence/postgres/migrations/migration.runner.ts';
import { AppError } from '../../src/domain/errors/app.error.ts';
import { anEmployee } from '../support/test-doubles.ts';

/**
 * Integración: el repositorio real contra PostgreSQL 17 (la misma imagen del Compose), levantado
 * por Testcontainers y destruido al final. El schema lo crean las migraciones del propio servicio,
 * así que aquí se verifica lo que los fakes no pueden: SQL, mapeo de columnas, y que las
 * restricciones de unicidad existan de verdad en el schema y no solo en el caso de uso.
 */
const SCHEMA = 'employees';

const hasCode = (code: string) => (error: unknown) => {
  assert.ok(error instanceof AppError, `se esperaba AppError y llegó ${String(error)}`);
  assert.equal(error.code, code);
  return true;
};

describe('PostgresEmployeeRepository (integración con PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let repository: PostgresEmployeeRepository;

  before(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withLabels({ 'rhm.test': 'ms-employees-integration' })
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri(), max: 2 });
    await runMigrations(pool, SCHEMA);
    repository = new PostgresEmployeeRepository(pool, SCHEMA);
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE "${SCHEMA}".employees`);
  });

  test('las migraciones son idempotentes', async () => {
    assert.deepEqual(await runMigrations(pool, SCHEMA), []);
  });

  test('guarda y recupera un empleado con todos sus campos mapeados', async () => {
    const saved = await repository.save(anEmployee());

    assert.deepEqual(await repository.findById('E001'), saved);
    assert.equal(saved.fechaIngreso, '2026-02-10');
    assert.equal(saved.fechaRetiro, null);
  });

  test('busca por email sin distinguir mayúsculas y por numeroEmpleado', async () => {
    await repository.save(anEmployee());

    assert.equal((await repository.findByEmail('JUAN.PEREZ@Empresa.com'))?.id, 'E001');
    assert.equal((await repository.findByEmployeeNumber('EMP-2026-001'))?.id, 'E001');
    assert.equal(await repository.findByEmployeeNumber('EMP-9999-999'), undefined);
  });

  describe('restricciones de unicidad del schema', () => {
    beforeEach(async () => {
      await repository.save(anEmployee());
    });

    // Se llama directamente a save(), saltando las validaciones del caso de uso: es la última línea
    // de defensa ante dos altas concurrentes que pasan la validación al mismo tiempo.
    test('el índice lower(email) rechaza el mismo email con otras mayúsculas', async () => {
      await assert.rejects(
        repository.save(anEmployee({ id: 'E002', numeroEmpleado: 'EMP-2026-002', email: 'Juan.Perez@EMPRESA.com' })),
        hasCode('DUPLICATE_EMAIL'),
      );
    });

    test('la restricción UNIQUE rechaza un numeroEmpleado repetido', async () => {
      await assert.rejects(
        repository.save(anEmployee({ id: 'E002', email: 'otro@empresa.com' })),
        hasCode('DUPLICATE_EMPLOYEE_NUMBER'),
      );
    });

    test('la clave primaria rechaza un id repetido', async () => {
      await assert.rejects(
        repository.save(anEmployee({ email: 'otro@empresa.com', numeroEmpleado: 'EMP-2026-002' })),
        hasCode('DUPLICATE_ID'),
      );
    });

    test('update no puede tomar el email de otro empleado', async () => {
      await repository.save(anEmployee({ id: 'E002', email: 'ana@empresa.com', numeroEmpleado: 'EMP-2026-002' }));

      await assert.rejects(
        repository.update(anEmployee({ id: 'E002', email: 'juan.perez@empresa.com', numeroEmpleado: 'EMP-2026-002' })),
        hasCode('DUPLICATE_EMAIL'),
      );
    });
  });

  test('el CHECK del schema rechaza un estado fuera del ciclo de vida', async () => {
    await assert.rejects(
      repository.save(anEmployee({ estado: 'SUSPENDIDO' as never })),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );
  });

  test('retire registra RETIRADO con fechaRetiro y la consulta de auditoría lo filtra', async () => {
    await repository.save(anEmployee());
    await repository.save(anEmployee({ id: 'E002', email: 'ana@empresa.com', numeroEmpleado: 'EMP-2026-002' }));

    const retired = await repository.retire('E001', '2026-03-15T10:00:00.000Z');

    assert.equal(retired.estado, 'RETIRADO');
    assert.equal(retired.fechaRetiro, '2026-03-15T10:00:00.000Z');
    assert.deepEqual((await repository.findAll({ estado: 'RETIRADO' })).map((e) => e.id), ['E001']);
    assert.deepEqual((await repository.findAll({ estado: 'ACTIVO' })).map((e) => e.id), ['E002']);
    assert.equal((await repository.findAll({ estado: 'RETIRADO', desde: '2026-03-16' })).length, 0);
    assert.equal((await repository.findAll({ estado: 'RETIRADO', desde: '2026-03-15', hasta: '2026-03-15' })).length, 1);
  });
});
