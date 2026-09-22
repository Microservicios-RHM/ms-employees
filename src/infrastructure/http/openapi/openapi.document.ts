import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';
import { ERROR_CODES } from '../../../shared/constants/error-codes.constants.ts';

const employeeProperties = {
  id: { type: 'string', example: 'E001' },
  nombre: { type: 'string', example: 'Juan' },
  apellido: { type: 'string', example: 'Pérez' },
  email: { type: 'string', format: 'email', example: 'juan.perez@empresa.com' },
  numeroEmpleado: { type: 'string', example: 'EMP-2026-001' },
  cargo: { type: 'string', example: 'Desarrollador Senior' },
  area: { type: 'string', example: 'Tecnología' },
  departamentoId: { type: 'string', example: 'IT' },
  fechaIngreso: { type: 'string', format: 'date', example: '2026-02-10' },
} as const;

const requiredEmployeeProperties = [
  'id',
  'nombre',
  'apellido',
  'email',
  'numeroEmpleado',
  'cargo',
  'area',
  'departamentoId',
  'fechaIngreso',
  'estado',
] as const;

const requiredCreateEmployeeProperties = requiredEmployeeProperties.filter(
  (property) => property !== 'estado',
);

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Microservicio de empleados',
    version: '1.0.0',
    description:
      'API para registrar y consultar empleados. Los datos son persistidos en PostgreSQL por el microservicio de empleados.',
  },
  servers: [{ url: '/', description: 'Servidor actual' }],
  tags: [
    { name: 'Health', description: 'Estado operativo del microservicio' },
    { name: 'Empleados', description: 'Registro y consulta de empleados' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Consultar el estado del servicio',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'El proceso está activo.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
                example: {
                  success: true,
                  message: RESPONSE_MESSAGES.service.available,
                  data: { status: 'UP' },
                },
              },
            },
          },
        },
      },
    },
    '/empleados': {
      get: {
        tags: ['Empleados'],
        summary: 'Listar todos los empleados',
        operationId: 'listEmployees',
        responses: {
          '200': {
            description: RESPONSE_MESSAGES.employee.listed,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/EmployeeListResponse' } },
            },
          },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
      post: {
        tags: ['Empleados'],
        summary: 'Registrar un empleado',
        description:
          'Registra un empleado activo. El id, email y número de empleado deben ser únicos, y el departamento se valida por HTTP.',
        operationId: 'registerEmployee',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateEmployeeRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: `${RESPONSE_MESSAGES.employee.registered}.`,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/EmployeeResponse' } },
            },
          },
          '400': {
            description: 'Datos inválidos, datos duplicados o departamento inexistente.',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/ErrorResponse' },
                    { $ref: '#/components/schemas/ValidationErrorResponse' },
                  ],
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalServerError' },
          '503': {
            description: 'El servicio de departamentos no está disponible después de los reintentos.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/empleados/{id}': {
      get: {
        tags: ['Empleados'],
        summary: 'Consultar un empleado por identificador',
        operationId: 'getEmployeeById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Identificador único del empleado.',
            schema: { type: 'string', minLength: 1 },
            example: 'E001',
          },
        ],
        responses: {
          '200': {
            description: 'Empleado encontrado.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/EmployeeResponse' } },
            },
          },
          '404': {
            description: 'El empleado solicitado no existe.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  message: RESPONSE_MESSAGES.employee.notFound('E999'),
                  data: null,
                  error: { code: ERROR_CODES.EMPLOYEE_NOT_FOUND },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
  },
  components: {
    schemas: {
      Health: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: { status: { type: 'string', enum: ['UP'] } },
      },
      HealthResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', const: true },
          message: { type: 'string', example: RESPONSE_MESSAGES.service.available },
          data: { $ref: '#/components/schemas/Health' },
        },
      },
      Employee: {
        type: 'object',
        additionalProperties: false,
        required: requiredEmployeeProperties,
        properties: {
          ...employeeProperties,
          estado: { type: 'string', enum: ['ACTIVO', 'EN_VACACIONES', 'RETIRADO'] },
        },
      },
      EmployeeResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', const: true },
          message: { type: 'string', example: RESPONSE_MESSAGES.employee.registered },
          data: { $ref: '#/components/schemas/Employee' },
        },
      },
      EmployeeListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', const: true },
          message: { type: 'string', example: RESPONSE_MESSAGES.employee.listed },
          data: { type: 'array', items: { $ref: '#/components/schemas/Employee' } },
        },
      },
      CreateEmployeeRequest: {
        type: 'object',
        additionalProperties: false,
        required: requiredCreateEmployeeProperties,
        properties: {
          ...employeeProperties,
        },
      },
      ErrorResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['success', 'message', 'data', 'error'],
        properties: {
          success: { type: 'boolean', const: false },
          message: {
            type: 'string',
            example: RESPONSE_MESSAGES.employee.duplicateEmail('juan.perez@empresa.com'),
          },
          data: { type: 'null' },
          error: {
            type: 'object',
            additionalProperties: false,
            required: ['code'],
            properties: { code: { type: 'string', example: ERROR_CODES.DUPLICATE_EMAIL } },
          },
        },
      },
      ValidationErrorResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['success', 'message', 'data', 'error'],
        properties: {
          success: { type: 'boolean', const: false },
          message: { type: 'string', example: RESPONSE_MESSAGES.validation.invalidInput },
          data: { type: 'null' },
          error: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'details'],
            properties: {
              code: { type: 'string', enum: [ERROR_CODES.VALIDATION_ERROR] },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['field', 'message'],
                  properties: {
                    field: { type: 'string', example: 'email' },
                    message: { type: 'string', example: RESPONSE_MESSAGES.validation.invalidEmail },
                  },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      InternalServerError: {
        description: 'Error no controlado en el servidor.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              success: false,
              message: RESPONSE_MESSAGES.server.internalError,
              data: null,
              error: { code: ERROR_CODES.INTERNAL_ERROR },
            },
          },
        },
      },
    },
  },
} as const;
