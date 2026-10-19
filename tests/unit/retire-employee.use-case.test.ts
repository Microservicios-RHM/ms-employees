import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { RetireEmployee } from '../../src/application/use-cases/retire-employee.use-case.ts';
import { AppError } from '../../src/domain/errors/app.error.ts';
import { InMemoryEmployeeRepository, RecordingEventPublisher, anEmployee } from '../support/test-doubles.ts';

describe('RetireEmployee (unidad)', () => {
  let repository: InMemoryEmployeeRepository;
  let publisher: RecordingEventPublisher;
  let useCase: RetireEmployee;

  beforeEach(() => {
    repository = new InMemoryEmployeeRepository([
      anEmployee({ id: 'E001' }),
      anEmployee({ id: 'E002', estado: 'EN_VACACIONES' }),
      anEmployee({ id: 'E003', estado: 'RETIRADO', fechaRetiro: '2026-01-01T00:00:00.000Z' }),
    ]);
    publisher = new RecordingEventPublisher();
    useCase = new RetireEmployee(repository, publisher);
  });

  test('transiciona ACTIVO -> RETIRADO registrando fechaRetiro y publica empleado.retirado', async () => {
    const before = Date.now();
    const retired = await useCase.execute('E001');

    assert.equal(retired.estado, 'RETIRADO');
    assert.ok(retired.fechaRetiro, 'fechaRetiro debe quedar registrada');
    const retiredAt = Date.parse(retired.fechaRetiro);
    assert.ok(retiredAt >= before && retiredAt <= Date.now(), 'fechaRetiro debe ser el instante del retiro');
    assert.deepEqual(publisher.types, ['empleado.retirado']);
    assert.equal((publisher.events[0]!.data as { id: string }).id, 'E001');
  });

  test('permite retirar a un empleado que está de vacaciones', async () => {
    assert.equal((await useCase.execute('E002')).estado, 'RETIRADO');
  });

  test('rechaza retirar dos veces: RETIRADO es un estado terminal', async () => {
    await assert.rejects(useCase.execute('E003'), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'EMPLOYEE_RETIRED');
      assert.equal(error.statusCode, 400);
      return true;
    });
    assert.deepEqual(repository.calls, []);
    assert.deepEqual(publisher.events, []);
  });

  test('responde 404 para un empleado inexistente', async () => {
    await assert.rejects(useCase.execute('E999'), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'EMPLOYEE_NOT_FOUND');
      assert.equal(error.statusCode, 404);
      return true;
    });
  });
});
