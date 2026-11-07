import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SynchronizeVacationStatus } from '../../src/application/use-cases/synchronize-vacation-status.use-case.ts';
import { InMemoryEmployeeRepository, anEmployee } from '../support/test-doubles.ts';

describe('SynchronizeVacationStatus', () => {
  test('transitions an active employee through vacation lifecycle', async () => {
    const repository = new InMemoryEmployeeRepository([anEmployee()]);
    const useCase = new SynchronizeVacationStatus(repository);

    await useCase.started('E001');
    assert.equal((await repository.findById('E001'))?.estado, 'EN_VACACIONES');

    await useCase.finished('E001');
    assert.equal((await repository.findById('E001'))?.estado, 'ACTIVO');
  });

  test('does not reactivate a retired employee', async () => {
    const repository = new InMemoryEmployeeRepository([anEmployee({ estado: 'RETIRADO' })]);
    const useCase = new SynchronizeVacationStatus(repository);

    await useCase.finished('E001');
    assert.equal((await repository.findById('E001'))?.estado, 'RETIRADO');
  });
});
