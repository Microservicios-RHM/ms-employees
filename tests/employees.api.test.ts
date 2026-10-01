import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../src/app.ts';
import type { Employee, EmployeeListFilters } from '../src/domain/entities/employee.entity.ts';
import type { EmployeeRepository } from '../src/domain/repositories/employee.repository.ts';
import type { DepartmentGateway } from '../src/domain/gateways/department.gateway.ts';
import type { DomainEvent, EventPublisher } from '../src/domain/gateways/event-publisher.gateway.ts';

class TestEmployeeRepository implements EmployeeRepository {
  private readonly employees = new Map<string, Employee>();

  async findAll(filters: EmployeeListFilters = {}): Promise<Employee[]> {
    return [...this.employees.values()]
      .filter((item) => !filters.estado || item.estado === filters.estado)
      .filter((item) => !filters.desde || (item.fechaRetiro ?? '') >= filters.desde)
      .filter((item) => !filters.hasta || (item.fechaRetiro ?? '9999-99-99') <= `${filters.hasta}T23:59:59.999Z`)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

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

  async update(item: Employee): Promise<Employee> {
    this.employees.set(item.id, item);
    return item;
  }

  async retire(id: string, fechaRetiro: string): Promise<Employee> {
    const existing = this.employees.get(id);
    if (!existing) throw new Error(`Empleado ${id} no existe en el doble de prueba`);
    const retired: Employee = { ...existing, estado: 'RETIRADO', fechaRetiro };
    this.employees.set(id, retired);
    return retired;
  }
}

class RecordingEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.events.push(event as DomainEvent);
  }
}

const testLogger = pino({ level: 'silent' });
const existingDepartmentGateway: DepartmentGateway = { existsById: async () => true };
const noopEventPublisher: EventPublisher = { publish: async () => undefined };
const createTestApp = (
  departmentGateway = existingDepartmentGateway,
  eventPublisher: EventPublisher = noopEventPublisher,
  repository: EmployeeRepository = new TestEmployeeRepository(),
) => createApp(repository, departmentGateway, eventPublisher, testLogger);

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
  fechaRetiro: null as string | null,
};

const { estado: _estado, fechaRetiro: _fechaRetiro, ...employeeRequest } = employee;

const updateRequest = {
  nombre: 'Juan',
  apellido: 'Pérez',
  email: employee.email,
  cargo: 'Tech Lead',
  area: 'Tecnología',
  departamentoId: 'IT',
};

describe('API de empleados', () => {
  test('registra y posteriormente consulta un empleado', async () => {
    const app = createTestApp();

    const created = await request(app).post('/empleados').send(employeeRequest).expect(201);
    assert.deepEqual(created.body, {
      success: true,
      message: 'Empleado registrado correctamente',
      data: employee,
    });
    assert.equal(created.headers.location, '/empleados/E001');

    const found = await request(app).get('/empleados/E001').expect(200);
    assert.deepEqual(found.body, {
      success: true,
      message: 'Empleado consultado correctamente',
      data: employee,
    });
  });

  test('lista todos los empleados registrados', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app).get('/empleados').expect(200);
    assert.deepEqual(response.body, {
      success: true,
      message: 'Empleados consultados correctamente',
      data: [employee],
    });
  });

  test('responde el mensaje exacto cuando el empleado no existe', async () => {
    const response = await request(createTestApp()).get('/empleados/E999').expect(404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, 'El empleado con id E999 no existe');
    assert.equal(response.body.data, null);
    assert.equal(response.body.error.code, 'EMPLOYEE_NOT_FOUND');
    assert.equal(response.body.error.status, 404);
    assert.equal(response.body.error.path, '/empleados/E999');
    assert.match(response.body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('responde el mensaje exacto para rutas o métodos no soportados', async () => {
    const app = createTestApp();
    const unknownRoute = await request(app).get('/otra-ruta').expect(404);
    const unsupportedMethod = await request(app).patch('/empleados/E001').expect(404);

    assert.equal(unknownRoute.body.message, 'Recurso no encontrado');
    assert.equal(unknownRoute.body.error.code, 'RESOURCE_NOT_FOUND');
    assert.equal(unsupportedMethod.body.message, 'Recurso no encontrado');
    assert.equal(unsupportedMethod.body.error.code, 'RESOURCE_NOT_FOUND');
  });

  test('rechaza emails duplicados sin distinguir mayúsculas', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app)
      .post('/empleados')
      .send({ ...employeeRequest, id: 'E002', email: 'JUAN.PEREZ@EMPRESA.COM', numeroEmpleado: 'EMP-2026-002' })
      .expect(400);

    assert.equal(response.body.error.code, 'DUPLICATE_EMAIL');
    assert.match(response.body.message, /ya está registrado/);
  });

  test('rechaza números de empleado duplicados', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app)
      .post('/empleados')
      .send({ ...employeeRequest, id: 'E002', email: 'otro@empresa.com' })
      .expect(400);

    assert.equal(response.body.error.code, 'DUPLICATE_EMPLOYEE_NUMBER');
  });

  test('publica empleado.creado tras registrar exitosamente', async () => {
    const eventPublisher = new RecordingEventPublisher();
    const app = createTestApp(existingDepartmentGateway, eventPublisher);

    await request(app).post('/empleados').send(employeeRequest).expect(201);

    assert.equal(eventPublisher.events.length, 1);
    assert.equal(eventPublisher.events[0].type, 'empleado.creado');
    assert.deepEqual(eventPublisher.events[0].data, employee);
  });

  test('actualiza un empleado y publica empleado.actualizado', async () => {
    const eventPublisher = new RecordingEventPublisher();
    const app = createTestApp(existingDepartmentGateway, eventPublisher);
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app)
      .put('/empleados/E001')
      .send(updateRequest)
      .expect(200);

    assert.equal(response.body.message, 'Empleado actualizado correctamente');
    assert.equal(response.body.data.cargo, 'Tech Lead');
    assert.equal(response.body.data.estado, 'ACTIVO');
    assert.equal(response.body.data.numeroEmpleado, employee.numeroEmpleado);

    const updateEvents = eventPublisher.events.filter((event) => event.type === 'empleado.actualizado');
    assert.equal(updateEvents.length, 1);
    assert.equal((updateEvents[0].data as { cargo: string }).cargo, 'Tech Lead');
  });

  test('responde 404 al actualizar un empleado inexistente', async () => {
    const response = await request(createTestApp())
      .put('/empleados/E999')
      .send(updateRequest)
      .expect(404);

    assert.equal(response.body.error.code, 'EMPLOYEE_NOT_FOUND');
  });

  test('rechaza actualizar hacia un email que ya usa otro empleado', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);
    await request(app)
      .post('/empleados')
      .send({ ...employeeRequest, id: 'E002', email: 'otro@empresa.com', numeroEmpleado: 'EMP-2026-002' })
      .expect(201);

    const response = await request(app)
      .put('/empleados/E002')
      .send({ ...updateRequest, email: employee.email })
      .expect(400);

    assert.equal(response.body.error.code, 'DUPLICATE_EMAIL');
  });

  test('rechaza actualizar hacia un departamento inexistente', async () => {
    const departmentGateway: DepartmentGateway = { existsById: async (id) => id === 'IT' };
    const app = createTestApp(departmentGateway);
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app)
      .put('/empleados/E001')
      .send({ ...updateRequest, departamentoId: 'HR' })
      .expect(400);

    assert.equal(response.body.error.code, 'DEPARTMENT_NOT_FOUND');
  });

  test('no permite actualizar un empleado retirado', async () => {
    const repository = new TestEmployeeRepository();
    await repository.save({ ...employee, estado: 'RETIRADO', fechaRetiro: new Date().toISOString() });
    const app = createTestApp(existingDepartmentGateway, noopEventPublisher, repository);

    const response = await request(app)
      .put('/empleados/E001')
      .send(updateRequest)
      .expect(400);

    assert.equal(response.body.error.code, 'EMPLOYEE_RETIRED');
  });

  test('valida el cuerpo de actualización y rechaza campos no soportados', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app)
      .put('/empleados/E001')
      .send({ ...updateRequest, numeroEmpleado: 'EMP-2026-999' })
      .expect(400);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  test('retira un empleado (baja lógica) y publica empleado.retirado', async () => {
    const eventPublisher = new RecordingEventPublisher();
    const app = createTestApp(existingDepartmentGateway, eventPublisher);
    await request(app).post('/empleados').send(employeeRequest).expect(201);

    const response = await request(app).delete('/empleados/E001').expect(200);

    assert.equal(response.body.message, 'Empleado retirado correctamente');
    assert.equal(response.body.data.estado, 'RETIRADO');
    assert.match(response.body.data.fechaRetiro, /^\d{4}-\d{2}-\d{2}T/);

    // Baja lógica: el registro sigue existiendo, solo cambió de estado.
    const found = await request(app).get('/empleados/E001').expect(200);
    assert.equal(found.body.data.estado, 'RETIRADO');

    const retiredEvents = eventPublisher.events.filter((event) => event.type === 'empleado.retirado');
    assert.equal(retiredEvents.length, 1);
    assert.equal((retiredEvents[0].data as { id: string }).id, 'E001');
  });

  test('responde 404 al retirar un empleado inexistente', async () => {
    const response = await request(createTestApp()).delete('/empleados/E999').expect(404);
    assert.equal(response.body.error.code, 'EMPLOYEE_NOT_FOUND');
  });

  test('no permite retirar dos veces al mismo empleado', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);
    await request(app).delete('/empleados/E001').expect(200);

    const response = await request(app).delete('/empleados/E001').expect(400);
    assert.equal(response.body.error.code, 'EMPLOYEE_RETIRED');
  });

  test('el endpoint de auditoría filtra por estado=RETIRADO y por rango de fechaRetiro', async () => {
    const app = createTestApp();
    await request(app).post('/empleados').send(employeeRequest).expect(201);
    await request(app)
      .post('/empleados')
      .send({ ...employeeRequest, id: 'E002', email: 'otro@empresa.com', numeroEmpleado: 'EMP-2026-002' })
      .expect(201);

    await request(app).delete('/empleados/E001').expect(200);

    const soloActivos = await request(app).get('/empleados').expect(200);
    assert.equal(soloActivos.body.data.length, 2);

    const soloRetirados = await request(app).get('/empleados?estado=RETIRADO').expect(200);
    assert.deepEqual(
      soloRetirados.body.data.map((item: { id: string }) => item.id),
      ['E001'],
    );

    const hoy = new Date().toISOString().slice(0, 10);
    const enRango = await request(app)
      .get(`/empleados?estado=RETIRADO&desde=${hoy}&hasta=${hoy}`)
      .expect(200);
    assert.equal(enRango.body.data.length, 1);

    const fueraDeRango = await request(app)
      .get('/empleados?estado=RETIRADO&desde=2000-01-01&hasta=2000-01-02')
      .expect(200);
    assert.equal(fueraDeRango.body.data.length, 0);
  });

  test('rechaza el filtro de auditoría cuando desde es posterior a hasta', async () => {
    const response = await request(createTestApp())
      .get('/empleados?desde=2026-06-30&hasta=2026-01-01')
      .expect(400);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  test('rechaza el registro cuando el departamento no existe', async () => {
    const app = createTestApp({ existsById: async () => false });
    const response = await request(app).post('/empleados').send(employeeRequest).expect(400);

    assert.equal(response.body.error.code, 'DEPARTMENT_NOT_FOUND');
    assert.equal(response.body.message, 'El departamento con id IT no existe');
  });

  test('valida el modelo canónico y solo permite estado ACTIVO', async () => {
    const response = await request(createTestApp())
      .post('/empleados')
      .send({ ...employeeRequest, email: 'correo-invalido', cargo: '' })
      .expect(400);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(
      response.body.error.details.map((detail: { field: string }) => detail.field),
      ['email', 'cargo'],
    );
  });

  test('rechaza campos que superan la longitud admitida antes de consultar la base de datos', async () => {
    const response = await request(createTestApp())
      .post('/empleados')
      .send({ ...employeeRequest, cargo: 'a'.repeat(151) })
      .expect(400);

    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(response.body.error.details, [
      { field: 'cargo', message: 'cargo no puede superar 150 caracteres' },
    ]);
  });

  test('rechaza JSON mal formado', async () => {
    const response = await request(createTestApp())
      .post('/empleados')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);

    assert.equal(response.body.error.code, 'INVALID_JSON');
  });

  test('responde 413 con el contrato de error cuando el cuerpo excede 1 MB', async () => {
    const response = await request(createTestApp())
      .post('/empleados')
      .send({ payload: 'a'.repeat(1_048_576) })
      .expect(413);

    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'REQUEST_BODY_TOO_LARGE');
    assert.equal(response.body.error.status, 413);
    assert.equal(response.body.error.path, '/empleados');
  });

  test('expone el health check', async () => {
    const response = await request(createTestApp()).get('/health').expect(200);
    assert.deepEqual(response.body, {
      success: true,
      message: 'Servicio disponible',
      data: { status: 'UP' },
    });
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
    const response = await request(createTestApp()).get('/empleados/openapi.json').expect(200);

    assert.equal(response.body.openapi, '3.1.0');
    assert.equal(response.body.info.title, 'Microservicio de empleados');
    assert.ok(response.body.paths['/empleados'].post);
    assert.ok(response.body.paths['/empleados'].get);
    assert.ok(response.body.paths['/empleados/{id}'].get);
    assert.ok(response.body.paths['/empleados'].post.responses['201']);
    assert.ok(response.body.components.schemas.Employee);
    assert.equal(response.body.components.schemas.EmployeeResponse.properties.success.const, true);
    assert.equal(response.body.components.schemas.ErrorResponse.properties.success.const, false);
  });

  test('expone Swagger UI', async () => {
    const response = await request(createTestApp()).get('/empleados/docs/').expect(200);
    assert.match(response.text, /Swagger UI/);
  });
});
