# Microservicio de empleados

Servicio HTTP del Reto 1 para registrar y consultar empleados. Está construido con Node.js,
TypeScript y Express, y conserva los datos en memoria durante la ejecución del proceso.

## Requisitos

- Node.js 24 y npm 11, o Docker.

## Ejecución local

```bash
npm ci
npm run dev
```

El servicio queda disponible en `http://localhost:8080`. La variable `PORT` permite cambiar el
puerto. Los datos se pierden al reiniciar porque este reto usa deliberadamente memoria.

Comandos de calidad:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run start:dist
```

## API

### Estado del servicio

```bash
curl -i http://localhost:8080/health
```

### Registrar un empleado

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
    "fechaIngreso":"2026-02-10",
    "estado":"ACTIVO"
  }'
```

Retorna `200 OK`. En este reto `estado` solo admite `ACTIVO`. Un email, identificador o número de
empleado repetido retorna `400 Bad Request` con un mensaje descriptivo.

### Consultar por identificador

```bash
curl -i http://localhost:8080/empleados/E001
curl -i http://localhost:8080/empleados/E999
```

La segunda petición retorna `404` y el texto exacto `El empleado con id E999 no existe`. Cualquier
ruta o método no soportado retorna `404` con `Recurso no encontrado`.

## Docker

```bash
docker build -t servidor-empleados .
docker run --rm -p 8080:8080 servidor-empleados
```

La imagen usa una construcción multietapa, ejecuta el proceso con un usuario sin privilegios e
incluye un `HEALTHCHECK` sobre `/health`.

## Arquitectura

El código aplica una separación por capas inspirada en arquitectura limpia:

```text
src/
├── domain/          Entidad, errores y contrato del repositorio
├── application/     Casos de uso (registrar y consultar)
└── infrastructure/  Express, validación HTTP y almacenamiento en memoria
```

El dominio no depende de Express ni del almacenamiento. Los casos de uso dependen de la interfaz
`EmployeeRepository`, de modo que una futura base de datos puede sustituir el repositorio en memoria
sin modificar las reglas de negocio. `createApp` funciona como raíz de composición e inyecta las
implementaciones; las pruebas crean una instancia aislada por escenario.

## Decisiones relevantes

- Validación de entrada mediante Zod y rechazo de propiedades desconocidas.
- Unicidad de `id`, `email` (sin distinguir mayúsculas) y `numeroEmpleado`.
- Respuestas de error consistentes, excepto los textos planos exigidos expresamente por el reto.
- Cabeceras de seguridad mediante Helmet y ocultamiento de `X-Powered-By`.
- Cierre ordenado ante `SIGINT` y `SIGTERM`.
- Pruebas HTTP automatizadas como evidencia reproducible de los casos exigidos.
