import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { UpdateEmployee, type UpdateEmployeeInput } from '../../src/application/use-cases/update-employee.use-case.ts';
import { GetEmployeeById } from '../../src/application/use-cases/get-employee-by-id.use-case.ts';
import { ListEmployees } from '../../src/application/use-cases/list-employees.use-case.ts';
import { AppError } from '../../src/domain/errors/app.error.ts';
import {
  InMemoryEmployeeRepository,
  RecordingEventPublisher,
  StubDepartmentGateway,
  anEmployee,
} from '../support/test-doubles.ts';

const changes = (overrides: Partial<UpdateEmployeeInput> = {}): UpdateEmployeeInput => ({
  nombre: 'Juan',
  apellido: 'Pérez',
  email: 'juan.perez@empresa.com',
  cargo: 'Líder técnico',
  area: 'Tecnología',
  departamentoId: 'IT',
  ...overrides,
});

const hasCode = (code: string, statusCode: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, code);
  assert.equal(error.statusCode, statusCode);
  return true;
};

describe('UpdateEmployee (unidad)', () => {
  let repository: InMemoryEmployeeRepository;
  let publisher: RecordingEventPublisher;
  let useCase: UpdateEmployee;

  beforeEach(() => {
    repository = new InMemoryEmployeeRepository([
      anEmployee({ id: 'E001' }),
      anEmployee({ id: 'E002', email: 'ana@empresa.com', numeroEmpleado: 'EMP-2026-002' }),
      anEmployee({ id: 'E003', email: 'ret@empresa.com', estado: 'RETIRADO', fechaRetiro: '2026-01-01T00:00:00.000Z' }),
    ]);
    publisher = new RecordingEventPublisher();
    useCase = new UpdateEmployee(repository, new StubDepartmentGateway(['IT', 'RRHH']), publisher);
  });

  test('actualiza los datos editables, conserva estado y numeroEmpleado, y publica empleado.actualizado', async () => {
    const updated = await useCase.execute('E001', changes({ cargo: '  Arquitecto ', departamentoId: ' RRHH ' }));

    assert.equal(updated.cargo, 'Arquitecto');
    assert.equal(updated.departamentoId, 'RRHH');
    assert.equal(updated.estado, 'ACTIVO');
    assert.equal(updated.numeroEmpleado, 'EMP-2026-001');
    assert.deepEqual(publisher.types, ['empleado.actualizado']);
  });

  test('permite conservar su propio email', async () => {
    assert.equal((await useCase.execute('E001', changes({ email: 'JUAN.PEREZ@empresa.com' }))).email, 'juan.perez@empresa.com');
  });

  test('rechaza cambiar al email de otro empleado', async () => {
    await assert.rejects(useCase.execute('E001', changes({ email: 'Ana@Empresa.com' })), hasCode('DUPLICATE_EMAIL', 400));
  });

  test('rechaza modificar a un empleado RETIRADO', async () => {
    await assert.rejects(useCase.execute('E003', changes({ email: 'ret@empresa.com' })), hasCode('EMPLOYEE_RETIRED', 400));
    assert.deepEqual(publisher.events, []);
  });

  test('rechaza un departamento inexistente', async () => {
    await assert.rejects(useCase.execute('E001', changes({ departamentoId: 'NOPE' })), hasCode('DEPARTMENT_NOT_FOUND', 400));
  });

  test('responde 404 para un empleado inexistente', async () => {
    await assert.rejects(useCase.execute('E999', changes()), hasCode('EMPLOYEE_NOT_FOUND', 404));
  });
});

describe('Consultas de empleados (unidad)', () => {
  const repository = new InMemoryEmployeeRepository([
    anEmployee({ id: 'E001' }),
    anEmployee({ id: 'E002', estado: 'RETIRADO', fechaRetiro: '2026-03-01T00:00:00.000Z' }),
  ]);

  test('GetEmployeeById devuelve el empleado o responde 404', async () => {
    const getById = new GetEmployeeById(repository);

    assert.equal((await getById.execute('E001')).id, 'E001');
    await assert.rejects(getById.execute('E404'), hasCode('EMPLOYEE_NOT_FOUND', 404));
  });

  test('ListEmployees delega el filtro de estado (consulta de auditoría de retirados)', async () => {
    const retired = await new ListEmployees(repository).execute({ estado: 'RETIRADO' });

    assert.deepEqual(retired.map((employee) => employee.id), ['E002']);
  });
});
