import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import pino from 'pino';
import { HttpDepartmentClient, type DepartmentClientConfig } from '../src/infrastructure/http/clients/http-department.client.ts';

const originalFetch = globalThis.fetch;
const logger = pino({ level: 'silent' });

const createConfig = (resetTimeoutMs = 30): DepartmentClientConfig => ({
  baseUrl: 'http://departamentos.test',
  timeoutMs: 50,
  maxAttempts: 1,
  retryBaseDelayMs: 1,
  totalTimeoutMs: 100,
  circuitBreakerThreshold: 3,
  circuitBreakerResetTimeoutMs: resetTimeoutMs,
  cacheTtlSeconds: 60,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('HttpDepartmentClient circuit breaker', () => {
  test('permite una validación exitosa en CLOSED', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200 } as Response;
    };

    const client = new HttpDepartmentClient(createConfig(), logger);

    assert.equal(await client.existsById('IT'), true);
    assert.equal(calls, 2);
  });

  test('trata 404 como respuesta válida y no abre el circuito', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: false, status: 404 } as Response;
    };

    const client = new HttpDepartmentClient(createConfig(), logger);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.equal(await client.existsById('NO-EXISTE'), false);
    }
    assert.equal(calls, 4);
  });

  test('usa una validación positiva en caché cuando Departamentos queda indisponible', async () => {
    let calls = 0;
    let available = true;
    globalThis.fetch = async (input) => {
      calls += 1;
      if (String(input).endsWith('/departamentos')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'IT' }] }) } as Response;
      }
      if (!available) throw new Error('departments unavailable');
      return { ok: true, status: 200 } as Response;
    };

    const client = new HttpDepartmentClient(createConfig(), logger);
    await client.warmUpCatalog();

    available = false;
    assert.equal(await client.existsById('IT'), true);
    assert.equal(calls, 2);
  });

  test('mantiene 503 si Departamentos está indisponible y no existe caché', async () => {
    globalThis.fetch = async () => {
      throw new Error('departments unavailable');
    };

    const client = new HttpDepartmentClient(createConfig(), logger);
    await assert.rejects(
      client.existsById('IT'),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'DEPARTMENT_SERVICE_UNAVAILABLE',
    );
  });

  test('abre por tasa de fallos de la ventana, incluso si hubo un éxito previo', async () => {
    let calls = 0;
    let available = false;
    globalThis.fetch = async () => {
      calls += 1;
      if (!available) throw new Error('departments unavailable');
      return { ok: true, status: 200 } as Response;
    };

    const client = new HttpDepartmentClient(createConfig(), logger);
    await assert.rejects(client.existsById('FIN'));
    available = true;
    assert.equal(await client.existsById('HR'), true);
    available = false;
    await assert.rejects(client.existsById('IT'));
    assert.equal(calls, 4);
  });

  test('abre tras tres fallos y rechaza sin ejecutar HTTP mientras está OPEN', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('departments unavailable');
    };

    const client = new HttpDepartmentClient(createConfig(), logger);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(
        client.existsById('IT'),
        (error: unknown) => error instanceof Error && 'code' in error && error.code === 'DEPARTMENT_SERVICE_UNAVAILABLE',
      );
    }

    await assert.rejects(
      client.existsById('IT'),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'DEPARTMENT_SERVICE_UNAVAILABLE',
    );
    assert.equal(calls, 3);
  });

  test('permite HALF_OPEN y vuelve a CLOSED después de una validación exitosa', async () => {
    let calls = 0;
    let available = false;
    globalThis.fetch = async () => {
      calls += 1;
      if (!available) throw new Error('departments unavailable');
      return { ok: true, status: 200 } as Response;
    };

    const client = new HttpDepartmentClient(createConfig(30), logger);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(client.existsById('IT'));
    }
    assert.equal(calls, 3);

    await new Promise((resolve) => setTimeout(resolve, 40));
    available = true;
    assert.equal(await client.existsById('IT'), true);
    assert.equal(calls, 5);
    assert.equal(await client.existsById('IT'), true);
    assert.equal(calls, 7);
  });

  test('mantiene OPEN si la prueba HALF_OPEN vuelve a fallar', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('departments unavailable');
    };

    const client = new HttpDepartmentClient(createConfig(30), logger);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(client.existsById('IT'));
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
    await assert.rejects(client.existsById('IT'));
    assert.equal(calls, 4);

    await assert.rejects(client.existsById('IT'));
    assert.equal(calls, 4);
  });
});
