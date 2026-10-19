import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { RegisterEmployee } from '../../src/application/use-cases/register-employee.use-case.ts';
import { AppError } from '../../src/domain/errors/app.error.ts';
import {
  InMemoryEmployeeRepository,
  RecordingEventPublisher,
  StubDepartmentGateway,
  aNewEmployee,
  anEmployee,
} from '../support/test-doubles.ts';

/** Rechaza con un AppError del código y estado esperados. */
async function assertRejectsWith(promise: Promise<unknown>, code: string, statusCode: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError, `se esperaba AppError y llegó ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

describe('RegisterEmployee (unidad)', () => {
  let repository: InMemoryEmployeeRepository;
  let departments: StubDepartmentGateway;
  let publisher: RecordingEventPublisher;
  let useCase: RegisterEmployee;

  beforeEach(() => {
    repository = new InMemoryEmployeeRepository([
      anEmployee({ id: 'E000', email: 'ana@empresa.com', numeroEmpleado: 'EMP-2026-000' }),
    ]);
    departments = new StubDepartmentGateway(['IT']);
    publisher = new RecordingEventPublisher();
    useCase = new RegisterEmployee(repository, departments, publisher);
  });

  test('registra un empleado ACTIVO sin fechaRetiro y publica empleado.creado', async () => {
    const saved = await useCase.execute(aNewEmployee());

    assert.equal(saved.estado, 'ACTIVO');
    assert.equal(saved.fechaRetiro, null);
    assert.deepEqual(publisher.types, ['empleado.creado']);
    assert.deepEqual(publisher.events[0]!.data, saved);
  });

  test('normaliza id, email y numeroEmpleado antes de validar y guardar', async () => {
    const saved = await useCase.execute(
      aNewEmployee({ id: '  E001 ', email: '  Juan.Perez@EMPRESA.com ', numeroEmpleado: ' EMP-2026-001 ' }),
    );

    assert.equal(saved.id, 'E001');
    assert.equal(saved.email, 'juan.perez@empresa.com');
    assert.equal(saved.numeroEmpleado, 'EMP-2026-001');
  });

  describe('unicidad', () => {
    test('rechaza un email ya registrado aunque difiera en mayúsculas', async () => {
      await assertRejectsWith(useCase.execute(aNewEmployee({ email: 'ANA@empresa.com' })), 'DUPLICATE_EMAIL', 400);
    });

    test('rechaza un numeroEmpleado ya registrado', async () => {
      await assertRejectsWith(
        useCase.execute(aNewEmployee({ numeroEmpleado: 'EMP-2026-000' })),
        'DUPLICATE_EMPLOYEE_NUMBER',
        400,
      );
    });

    test('rechaza un id ya registrado', async () => {
      await assertRejectsWith(useCase.execute(aNewEmployee({ id: 'E000' })), 'DUPLICATE_ID', 400);
    });

    test('valida la unicidad antes de consultar a departamentos', async () => {
      await assert.rejects(useCase.execute(aNewEmployee({ email: 'ana@empresa.com' })));

      assert.deepEqual(departments.queried, []);
    });
  });

  test('rechaza un departamento inexistente', async () => {
    await assertRejectsWith(useCase.execute(aNewEmployee({ departamentoId: 'NOPE' })), 'DEPARTMENT_NOT_FOUND', 400);
  });

  test('cuando una validación falla no guarda ni publica nada', async () => {
    await assert.rejects(useCase.execute(aNewEmployee({ departamentoId: 'NOPE' })));

    assert.equal(repository.size, 1);
    assert.deepEqual(repository.calls, []);
    assert.deepEqual(publisher.events, []);
  });
});
