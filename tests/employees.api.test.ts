import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.ts';

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
    const app = createApp();

    const created = await request(app).post('/empleados').send(employee).expect(200);
    assert.deepEqual(created.body, employee);

    const found = await request(app).get('/empleados/E001').expect(200);
    assert.deepEqual(found.body, employee);
  });

  test('responde el mensaje exacto cuando el empleado no existe', async () => {
    const response = await request(createApp()).get('/empleados/E999').expect(404);
    assert.equal(response.text, 'El empleado con id E999 no existe');
  });

  test('responde el mensaje exacto para rutas o métodos no soportados', async () => {
    const app = createApp();
    const unknownRoute = await request(app).get('/otra-ruta').expect(404);
    const unsupportedMethod = await request(app).put('/empleados/E001').expect(404);

    assert.equal(unknownRoute.text, 'Recurso no encontrado');
    assert.equal(unsupportedMethod.text, 'Recurso no encontrado');
  });

  test('rechaza emails duplicados sin distinguir mayúsculas', async () => {
    const app = createApp();
    await request(app).post('/empleados').send(employee).expect(200);

    const response = await request(app)
      .post('/empleados')
      .send({ ...employee, id: 'E002', email: 'JUAN.PEREZ@EMPRESA.COM', numeroEmpleado: 'EMP-2026-002' })
      .expect(400);

    assert.equal(response.body.code, 'DUPLICATE_EMAIL');
    assert.match(response.body.error, /ya está registrado/);
  });

  test('rechaza números de empleado duplicados', async () => {
    const app = createApp();
    await request(app).post('/empleados').send(employee).expect(200);

    const response = await request(app)
      .post('/empleados')
      .send({ ...employee, id: 'E002', email: 'otro@empresa.com' })
      .expect(400);

    assert.equal(response.body.code, 'DUPLICATE_EMPLOYEE_NUMBER');
  });

  test('valida el modelo canónico y solo permite estado ACTIVO', async () => {
    const response = await request(createApp())
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
    const response = await request(createApp())
      .post('/empleados')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);

    assert.equal(response.body.code, 'INVALID_JSON');
  });

  test('expone el health check', async () => {
    const response = await request(createApp()).get('/health').expect(200);
    assert.deepEqual(response.body, { status: 'UP' });
  });
});
