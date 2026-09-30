# Microservicio de empleados

Servicio HTTP para registrar y consultar empleados, construido con Node.js, TypeScript, Express y
PostgreSQL. Los registros se almacenan exclusivamente en el schema `employees` de la base
independiente `employees_db`.

## Requisitos

- Node.js 24 y npm 11 (solo para tooling local: typecheck, tests, lint).
- Docker y Docker Compose para ejecutar el servicio real.

## Ejecución (solo Docker Compose)

Desde el Reto 3, `rhm-database-infrastructure` ya no publica al host los puertos de PostgreSQL ni
de `departamentos-service`: ambos solo son alcanzables dentro de la red Docker
(`microservices-network`). Por eso `npm run dev` **no puede** apuntar a una base de datos ni a
departamentos corriendo fuera de Docker — no hay `localhost:5433` ni `localhost:8081` a los que
conectarse. El único flujo soportado para correr el servicio completo es:

```bash
cd ../rhm-database-infrastructure
cp .env.example .env
docker compose up --build
```

El servicio queda disponible en `http://localhost:8080` (a través del `api-gateway`, según
`docker-compose.yml`). Dentro de Docker resuelve `database-empleados:5432` y
`departamentos-service:80`; el `.env.example` de este repositorio refleja esos valores de
referencia, no los de una base de datos accesible desde el host.

## Configuración local (tooling, no ejecución)

Instalar dependencias para poder correr `npm run typecheck` / `npm test` / `npm run build` sin
Docker:

```bash
npm ci
cp .env.example .env
```

`npm test` usa dobles de prueba, no una conexión real, así que no depende de que la infraestructura
esté levantada. `npm run dev` y `npm run db:migrate` sí necesitan PostgreSQL accesible por
`DB_HOST`/`DB_PORT`; con la infraestructura actual, la única forma de tener esa conectividad es
ejecutando este servicio como contenedor dentro de `docker-compose.yml` (arriba), no sueltos en el
host.

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

En Docker, las rutas públicas pasan por el Gateway:

```text
Base URL:       http://localhost:8080
Empleados:      http://localhost:8080/empleados
Departamentos:  http://localhost:8080/departamentos
Health Gateway: http://localhost:8080/health
```

`empleados-service` no publica directamente su puerto HTTP al host; su puerto interno es `8080`.

Documentación interactiva y contrato OpenAPI:

```text
Swagger UI:       http://localhost:8080/empleados/docs
Documento JSON:  http://localhost:8080/empleados/openapi.json
```

Montados bajo `/empleados` a propósito: es el mismo prefijo que el API Gateway ya proxea sin
reescribir la ruta, así que quedan alcanzables detrás del Gateway (`http://localhost:8080`) sin
ningún cambio en `api-gateway`.

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
    "code": "EMPLOYEE_NOT_FOUND",
    "status": 404,
    "path": "/empleados/E999",
    "timestamp": "2026-02-10T12:00:00.000Z"
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

Actualizar un empleado (nombre, apellido, email, cargo, área y departamento; `id`, `numeroEmpleado`,
`fechaIngreso` y `estado` no se aceptan en este endpoint y su presencia en el body causa
`400 VALIDATION_ERROR`). Publica `empleado.actualizado`:

```bash
curl -i -X PUT http://localhost:8080/empleados/E001 \
  -H "Content-Type: application/json" \
  -d '{
    "nombre":"Juan",
    "apellido":"Pérez",
    "email":"juan.perez@empresa.com",
    "cargo":"Tech Lead",
    "area":"Tecnología",
    "departamentoId":"IT"
  }'
```

Reglas adicionales: `404 EMPLOYEE_NOT_FOUND` si el id no existe; `400 EMPLOYEE_RETIRED` si el
empleado ya está `RETIRADO` (la baja lógica, Reto 4, lo vuelve inmutable); `400 DUPLICATE_EMAIL` si
el nuevo email ya lo usa otro empleado; `400 DEPARTMENT_NOT_FOUND` / `503
DEPARTMENT_SERVICE_UNAVAILABLE` con la misma validación HTTP que `POST /empleados`.

Retirar un empleado (baja lógica: nunca se borra físicamente, se transiciona a `RETIRADO` y se
persiste `fechaRetiro`; regla de dominio del Reto 0). Publica `empleado.retirado`. Un empleado ya
`RETIRADO` no puede retirarse otra vez (`400 EMPLOYEE_RETIRED`):

```bash
curl -i -X DELETE http://localhost:8080/empleados/E001
curl -i http://localhost:8080/empleados/E001
# estado: "RETIRADO", fechaRetiro: "2026-...Z" — el registro sigue existiendo
```

Auditoría de retiros — `GET /empleados` acepta filtros opcionales por query string. `desde`/`hasta`
(formato `YYYY-MM-DD`, inclusivos) filtran por `fechaRetiro`, así que solo tienen efecto real
combinados con `estado=RETIRADO` (son los únicos empleados con esa fecha):

```bash
curl -i "http://localhost:8080/empleados?estado=RETIRADO"
curl -i "http://localhost:8080/empleados?estado=RETIRADO&desde=2026-01-01&hasta=2026-06-30"
```

`desde` posterior a `hasta`, o un `estado` fuera de `ACTIVO`/`EN_VACACIONES`/`RETIRADO`, responden
`400 VALIDATION_ERROR`.

## Persistencia

La primera migración crea:

- `employees.employees`, con el modelo canónico completo.
- Clave primaria para `id`.
- Restricción única para `numero_empleado`.
- Índice único sobre `lower(email)` para evitar duplicados sin distinguir mayúsculas.
- Restricción de estados `ACTIVO`, `EN_VACACIONES` y `RETIRADO`.
- Índices para `departamento_id` y `estado`.
- Trazabilidad mediante `created_at` y `updated_at`.

La segunda migración (Reto 4) agrega `fecha_retiro TIMESTAMPTZ NULL` y su índice, para soportar la
baja lógica y el filtro de auditoría por rango de fechas.

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

Dentro de Docker, PostgreSQL se resuelve como `database-empleados:5432`. Ese puerto no se publica al
host en ningún sistema operativo: la única forma de acceder a los datos es a través de este
servicio. Compose espera a que PostgreSQL esté `healthy`. El servicio aplica migraciones
antes de iniciar, usa una imagen multietapa y ejecuta Node con un usuario sin privilegios. El acceso
externo debe realizarse por `http://localhost:8080`; el Gateway enruta `/empleados/*` y
`/departamentos/*` hacia los servicios internos.

### Integración con departamentos (Reto 2)

El registro consulta `GET {DEPARTMENTS_SERVICE_URL}/departamentos/{id}` después de validar la
unicidad del email y del número de empleado. La llamada tiene timeout explícito y tres intentos con
espera exponencial. Un `404` se traduce en `400 DEPARTMENT_NOT_FOUND`; si la dependencia no
responde tras los reintentos se rechaza el alta con `503 DEPARTMENT_SERVICE_UNAVAILABLE`. De esta
forma no se persisten referencias sin validar y empleados nunca accede a la base de datos de
departamentos.

Variables nuevas (valor real usado dentro de Docker; `http://localhost:8081` ya no es alcanzable
porque `departamentos-service` no publica puerto al host):

```dotenv
DEPARTMENTS_SERVICE_URL=http://departamentos-service
DEPARTMENTS_TIMEOUT_MS=2000
DEPARTMENTS_MAX_ATTEMPTS=3
DEPARTMENTS_RETRY_BASE_DELAY_MS=1000
DEPARTMENTS_TOTAL_TIMEOUT_MS=9000
DEPARTMENTS_CIRCUIT_BREAKER_THRESHOLD=3
DEPARTMENTS_CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

En Docker, la URL es `http://departamentos-service` porque se utiliza el nombre DNS interno y el
puerto interno del contenedor, no `localhost` ni el puerto publicado al host.

### Circuit Breaker (Reto 3)

La operación `HttpDepartmentClient.existsById()` está protegida por un Circuit Breaker
implementado con `opossum` dentro de `ms-employees`. El breaker envuelve la operación completa,
incluidos sus reintentos y backoff; por eso los intentos internos no incrementan individualmente
el contador de fallos.

La configuración actual es:

```dotenv
DEPARTMENTS_CIRCUIT_BREAKER_THRESHOLD=3
DEPARTMENTS_CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

`DEPARTMENTS_CIRCUIT_BREAKER_THRESHOLD` establece el volumen mínimo de tres operaciones; cuando
la tasa de fallos alcanza 50 % en la ventana de 30 segundos, `opossum` abre el circuito.
`DEPARTMENTS_CIRCUIT_BREAKER_RESET_TIMEOUT_MS` mantiene el circuito abierto durante 30 segundos
antes de permitir una llamada de prueba en `HALF_OPEN`. El timeout de opossum está
desactivado deliberadamente: el timeout por intento y el timeout total existentes siguen siendo
la única política de tiempo de la llamada HTTP.

En `CLOSED`, las validaciones se ejecutan normalmente. Un `2xx` cuenta como éxito y un `404` se
traduce a `false`, por lo que conserva el comportamiento `DEPARTMENT_NOT_FOUND` con HTTP `400` y
no abre el circuito. Los errores `5xx`, los timeouts y los errores de red se reintentan según la
configuración existente; si la operación completa falla, cuenta como un único fallo del breaker.

En `OPEN`, no se ejecuta ninguna llamada HTTP a departamentos. El fallback responde mediante el
error existente `DEPARTMENT_SERVICE_UNAVAILABLE` con HTTP `503`, sin persistir ningún empleado ni
introducir el estado `PENDIENTE_VALIDACION` en el dominio o en PostgreSQL. Tras el reset timeout,
`HALF_OPEN` permite una única llamada de prueba: un éxito cierra el circuito y un fallo lo vuelve
a abrir.

Las transiciones `OPEN`, `HALF_OPEN` y `CLOSED`, además de los éxitos, fallos, rechazos y ejecución
del fallback, se registran con el logger Pino existente.

Para ejecutar las pruebas deterministas del breaker:

```bash
npm test
```

Las pruebas simulan respuestas de departamentos y verifican `CLOSED`, `404`, `OPEN`, `HALF_OPEN`
con recuperación y `HALF_OPEN` con fallo, sin modificar PostgreSQL ni depender de esperar los
30 segundos de producción.

### Publicación de eventos (Reto 4)

Tras persistir exitosamente un alta (`POST /empleados`), una actualización (`PUT /empleados/{id}`)
o un retiro (`DELETE /empleados/{id}`), el servicio publica `empleado.creado`,
`empleado.actualizado` o `empleado.retirado` respectivamente en RabbitMQ. El
contrato completo del envelope y del payload está en `docs/event-catalog.md` del
repositorio [rhm-database-infrastructure](https://github.com/Microservicios-RHM/rhm-database-infrastructure)
(es un repositorio separado, por eso no hay un enlace relativo); aquí solo se documenta la
implementación.

Variables nuevas:

```dotenv
BROKER_URL=amqp://admin:admin@message-broker:5672
BROKER_EXCHANGE=rhm.events
BROKER_CONNECT_MAX_ATTEMPTS=5
BROKER_CONNECT_RETRY_DELAY_MS=1000
```

Al arrancar, el servicio intenta conectarse a RabbitMQ con reintentos y backoff (igual que hace con
PostgreSQL), pero a diferencia de la base de datos **no es una dependencia dura**: si el broker no
está disponible tras agotar los intentos, el servicio sigue arrancando de todas formas. Cada
`RegisterEmployee.execute()` primero persiste el empleado y solo después intenta publicar el
evento; `EventPublisher.publish()` nunca rechaza — un fallo (broker caído, canal cerrado, etc.) se
registra con Pino como `error` y la petición HTTP sigue respondiendo `201`, tal como exige el
enunciado ("si la publicación del evento falla, el servicio debe registrar el error pero no
revertir la operación de base de datos").

Arquitectura de la implementación:

```text
src/domain/gateways/event-publisher.gateway.ts       Puerto EventPublisher (dominio)
src/infrastructure/messaging/rabbitmq/
├── rabbitmq.connection.ts        Conexión/canal con reconexión perezosa
└── rabbitmq-event.publisher.ts   Adaptador: construye el envelope y publica
```

El exchange (`rhm.events`, tipo `topic`, durable) lo declara este servicio al publicar
(`assertExchange`, idempotente). Las colas de los consumidores (`notificaciones-service`,
`perfiles-service`, `vacaciones-service`) se declaran en cada uno de esos servicios, no aquí —
así el fan-out no depende de que este servicio conozca a sus consumidores.

Para verificar manualmente: con el stack levantado, `POST /empleados` y luego abrir
`http://localhost:15672` → `Exchanges` → `rhm.events` → pestaña `Publish message rate`, donde
debe verse un pico de 1 mensaje por cada alta.

## Arquitectura

```text
src/
├── domain/          Entidad, errores, y contratos (repositorio, departamentos, eventos)
├── application/     Casos de uso de registro y consulta
└── infrastructure/
    ├── http/        Controladores, rutas, schemas, errores HTTP y cliente de departamentos
    ├── messaging/
    │   └── rabbitmq/ Conexión y publicador de eventos
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
