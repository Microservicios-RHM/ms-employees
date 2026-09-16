# Microservicio de empleados

Servicio HTTP para registrar y consultar empleados, construido con Node.js, TypeScript, Express y
PostgreSQL. Los registros se almacenan exclusivamente en el schema `employees` de la base
independiente `employees_db`.

## Requisitos

- Node.js 24 y npm 11.
- PostgreSQL de `rhm-database-infrastructure` disponible en `localhost:5433`.
- Docker para ejecución contenerizada.

## Configuración local

Instalar dependencias y crear la configuración privada:

```bash
npm ci
cp .env.example .env
```

Variables principales:

```env
DB_HOST=localhost
DB_PORT=5433
DB_NAME=employees_db
DB_SCHEMA=employees
DB_USER=employees_service
DB_PASSWORD=la_clave_configurada_en_la_infraestructura
```

El archivo `.env` nunca se versiona. La aplicación valida toda la configuración al arrancar y falla
inmediatamente si falta una variable requerida o PostgreSQL no está disponible.

## Migraciones y ejecución

Las migraciones pertenecen a este microservicio y se registran en
`employees.schema_migrations`. Son idempotentes: ejecutar el comando varias veces no repite cambios.

```bash
npm run db:migrate
npm run dev
```

El servidor también aplica las migraciones pendientes antes de comenzar a escuchar peticiones.
Queda disponible en `http://localhost:8080`.

Comandos disponibles:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run start:dist
```

## API

Health check:

```bash
curl -i http://localhost:8080/health
```

Documentación interactiva y contrato OpenAPI:

```text
Swagger UI:       http://localhost:8080/docs
Documento JSON:  http://localhost:8080/openapi.json
```

Swagger UI permite inspeccionar schemas, respuestas y ejemplos, y ejecutar peticiones directamente
contra el servidor actual.

## Contrato general de respuestas

Todos los endpoints JSON de la aplicación usan un envelope consistente. Una respuesta exitosa tiene
la siguiente estructura:

```json
{
  "success": true,
  "message": "Empleado registrado correctamente",
  "data": {
    "id": "E001"
  }
}
```

Los errores mantienen los mismos campos base y agregan información técnica estable dentro de
`error`. Los clientes deben tomar decisiones usando `error.code`, no comparando el texto de
`message`:

```json
{
  "success": false,
  "message": "El empleado con id E999 no existe",
  "data": null,
  "error": {
    "code": "EMPLOYEE_NOT_FOUND"
  }
}
```

Los errores de validación incluyen además `error.details`, con el campo y mensaje correspondiente.
La creación de estas respuestas está centralizada y tipada para evitar formatos diferentes entre
controladores.

Los mensajes, códigos de error y estados HTTP tampoco se escriben directamente en controladores o
casos de uso. Se administran desde catálogos compartidos:

```text
src/shared/constants/
├── response-messages.constants.ts
├── error-codes.constants.ts
└── http-status.constants.ts
```

Los mensajes dinámicos se generan mediante funciones del catálogo, por ejemplo
`RESPONSE_MESSAGES.employee.notFound(id)`.

`/openapi.json` y `/docs` son excepciones técnicas: deben entregar OpenAPI puro y recursos HTML de
Swagger respectivamente para conservar compatibilidad con sus herramientas.

## Logs y trazabilidad

Cada petición genera un log al finalizar con método, URL, código HTTP, duración y un identificador
de correlación. El mismo valor se devuelve en la cabecera `X-Request-Id`. Si otro microservicio envía
esa cabecera, `ms-employees` la conserva para facilitar el seguimiento de una operación distribuida.

Configuración disponible:

```env
LOG_LEVEL=debug
LOG_PRETTY=true
```

En desarrollo, `LOG_PRETTY=true` produce una consola legible y coloreada. En Docker y producción se
usa `LOG_PRETTY=false`, generando una línea JSON por evento para que Docker, Loki, ELK u otra
plataforma pueda recolectarla correctamente.

```bash
docker logs -f ms-employees
```

No se registran cuerpos de solicitudes ni datos personales de empleados. Las cabeceras de
autorización, cookies y campos de contraseña están configurados para ser censurados.
El endpoint `/health` se excluye del access log para evitar ruido producido por los health checks
periódicos de Docker.

Registrar un empleado:

```bash
curl -i -X POST http://localhost:8080/empleados \
  -H "Content-Type: application/json" \
  -d '{
    "id":"E001",
    "nombre":"Juan",
    "apellido":"Pérez",
    "email":"juan.perez@empresa.com",
    "numeroEmpleado":"EMP-2026-001",
    "cargo":"Desarrollador Senior",
    "area":"Tecnología",
    "departamentoId":"IT",
    "fechaIngreso":"2026-02-10"
  }'
```

Consultar por identificador:

```bash
curl -i http://localhost:8080/empleados/E001
curl -i http://localhost:8080/empleados/E999
curl -i http://localhost:8080/empleados
```

## Persistencia

La primera migración crea:

- `employees.employees`, con el modelo canónico completo.
- Clave primaria para `id`.
- Restricción única para `numero_empleado`.
- Índice único sobre `lower(email)` para evitar duplicados sin distinguir mayúsculas.
- Restricción de estados `ACTIVO`, `EN_VACACIONES` y `RETIRADO`.
- Índices para `departamento_id` y `estado`.
- Trazabilidad mediante `created_at` y `updated_at`.

El código realiza validaciones descriptivas y PostgreSQL mantiene las restricciones como garantía
final ante solicitudes concurrentes. El servicio utiliza un pool de conexiones y consultas
parametrizadas.

La base `employees_db`, su usuario y su volumen pertenecen exclusivamente a este microservicio.
Ningún servicio futuro debe consultar sus tablas directamente; cualquier interacción se realizará
mediante el contrato HTTP de empleados.

La unicidad se garantiza en dos capas: consulta previa para entregar mensajes descriptivos y
restricciones `UNIQUE` en PostgreSQL para cerrar la condición de carrera entre peticiones
concurrentes.

`POST /empleados` responde `201 Created`. El estado no se recibe desde el cliente: el caso de uso lo
asigna siempre como `ACTIVO`, según la regla del Reto 2.

## Docker Compose

El despliegue recomendado se ejecuta desde `rhm-database-infrastructure`, que crea la base exclusiva,
el volumen, la red y este servicio:

```bash
cd ../rhm-database-infrastructure
docker compose up --build
```

Para verificar:

```bash
docker compose ps
```

Dentro de Docker, PostgreSQL se resuelve como `database-empleados:5432`; `localhost:5433` se usa
solo desde Windows. Compose espera a que PostgreSQL esté `healthy`. El servicio aplica migraciones
antes de iniciar, usa una imagen multietapa y ejecuta Node con un usuario sin privilegios.

## Arquitectura

```text
src/
├── domain/          Entidad, errores y contrato del repositorio
├── application/     Casos de uso de registro y consulta
└── infrastructure/
    ├── http/        Controladores, rutas, schemas y errores HTTP
    └── persistence/
        └── postgres/ Cliente, repositorio y migraciones PostgreSQL
```

Los casos de uso dependen de `EmployeeRepository`, no de `pg`. La raíz de composición construye
`PostgresEmployeeRepository`; no existe una implementación en memoria en el código de producción.
Las pruebas unitarias inyectan un doble aislado y la integración real fue verificada contra
PostgreSQL.

### Convención de nombres

Todos los archivos usan `kebab-case` y un sufijo que expresa su responsabilidad:

```text
employee.entity.ts
register-employee.use-case.ts
employee.repository.ts
postgres-employee.repository.ts
employee.controller.ts
employee.routes.ts
employee.schema.ts
error-handler.middleware.ts
openapi.document.ts
documentation.routes.ts
environment.config.ts
001-create-employees-table.migration.ts
migration.runner.ts
```

Los únicos puntos de entrada sin sufijo son `app.ts` y `server.ts`, nombres convencionales en
aplicaciones Express.
