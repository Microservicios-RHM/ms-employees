import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../src/app.ts';
import type { Employee } from '../src/domain/entities/employee.entity.ts';
import type { EmployeeRepository } from '../src/domain/repositories/employee.repository.ts';

class TestEmployeeRepository implements EmployeeRepository {
  private readonly employees = new Map<string, Employee>();

  async findById(id: string): Promise<Employee | undefined> {
    return this.employees.get(id);
  }

  async findByEmail(email: string): Promise<Employee | undefined> {
    return [...this.employees.values()].find((item) => item.email === email.toLowerCase());
  }

  async findByEmployeeNumber(employeeNumber: string): Promise<Employee | undefined> {
    return [...this.employees.values()].find((item) => item.numeroEmpleado === employeeNumber);
  }

  async save(item: Employee): Promise<Employee> {
    this.employees.set(item.id, item);
    return item;
  }
}

const testLogger = pino({ level: 'silent' });
const createTestApp = () => createApp(new TestEmployeeRepository(), testLogger);

const employee = {
  id: 'E001',
  nombre: 'Juan',
  apellido: 'Pérez',
  email: 'juan.perez@empresa.com',
  numeroEmpleado: 'EMP-2026-001',
  cargo: 'Desarrollador Senior',
  area: 'Tecnología',
  departamentoId: 'IT',
  fechaIngreso: '2026-02-10',
  estado: 'ACTIVO' as const,
};

describe('API de empleados', () => {
  test('registra y posteriormente consulta un empleado', async () => {
    const app = createTestApp();

    const created = await request(app).post('/empleados').send(employee).expect(200);
    assert.deepEqual(created.body, employee);

    const found = await request(app).get('/empleados/E001').expect(200);
    assert.deepEqual(found.body, employee);
  });

  test('responde el mensaje exacto cuando el empleado no existe', async () => {
    const response = await request(createTestApp()).get('/empleados/E999').expect(404);
    assert.equal(response.text, 'El empleado con id E999 no existe');
  });

  test('responde el mensaje exacto para rutas o métodos no soportados', async () => {
    const app = createTestApp();
    const unknownRoute = await request(app).get('/otra-ruta').expect(404);
    const unsupportedMethod = await request(app).put('/empleados/E001').expect(404);

    assert.equal(unknownRoute.text, 'Recurso no encontrado');
    assert.equal(unsupportedMethod.text, 'Recurso no encontrado');
  });

  test('rechaza emails duplicados sin distinguir mayúsculas', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employee).expect(200);

    const response = await request(app)
      .post('/empleados')
      .send({ ...employee, id: 'E002', email: 'JUAN.PEREZ@EMPRESA.COM', numeroEmpleado: 'EMP-2026-002' })
      .expect(400);

    assert.equal(response.body.code, 'DUPLICATE_EMAIL');
    assert.match(response.body.error, /ya está registrado/);
  });

  test('rechaza números de empleado duplicados', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employee).expect(200);

    const response = await request(app)
      .post('/empleados')
      .send({ ...employee, id: 'E002', email: 'otro@empresa.com' })
      .expect(400);

    assert.equal(response.body.code, 'DUPLICATE_EMPLOYEE_NUMBER');
  });

  test('valida el modelo canónico y solo permite estado ACTIVO', async () => {
    const response = await request(createTestApp())
      .post('/empleados')
      .send({ ...employee, email: 'correo-invalido', estado: 'RETIRADO', cargo: '' })
      .expect(400);

    assert.equal(response.body.code, 'VALIDATION_ERROR');
    assert.deepEqual(
      response.body.details.map((detail: { field: string }) => detail.field),
      ['email', 'cargo', 'estado'],
    );
  });

  test('rechaza JSON mal formado', async () => {
    const response = await request(createTestApp())
      .post('/empleados')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);

    assert.equal(response.body.code, 'INVALID_JSON');
  });

  test('expone el health check', async () => {
    const response = await request(createTestApp()).get('/health').expect(200);
    assert.deepEqual(response.body, { status: 'UP' });
    assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
  });

  test('conserva el requestId recibido para correlación entre servicios', async () => {
    const response = await request(createTestApp())
      .get('/health')
      .set('X-Request-Id', 'onboarding-request-123')
      .expect(200);

    assert.equal(response.headers['x-request-id'], 'onboarding-request-123');
  });

  test('publica el documento OpenAPI 3.1', async () => {
    const response = await request(createTestApp()).get('/openapi.json').expect(200);

    assert.equal(response.body.openapi, '3.1.0');
    assert.equal(response.body.info.title, 'Microservicio de empleados');
    assert.ok(response.body.paths['/empleados'].post);
    assert.ok(response.body.paths['/empleados/{id}'].get);
    assert.ok(response.body.components.schemas.Employee);
  });

  test('expone Swagger UI', async () => {
    const response = await request(createTestApp()).get('/docs/').expect(200);
    assert.match(response.text, /Swagger UI/);
  });
});
