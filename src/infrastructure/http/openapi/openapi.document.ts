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
                schema: { $ref: '#/components/schemas/Health' },
                example: { status: 'UP' },
              },
            },
          },
        },
      },
    },
    '/empleados': {
      post: {
        tags: ['Empleados'],
        summary: 'Registrar un empleado',
        description:
          'Registra un empleado activo. El id, email y número de empleado deben ser únicos.',
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
          '200': {
            description: 'Empleado registrado correctamente.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Employee' } },
            },
          },
          '400': {
            description: 'Datos inválidos o identificador, email o número de empleado duplicado.',
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
              'application/json': { schema: { $ref: '#/components/schemas/Employee' } },
            },
          },
          '404': {
            description: 'El empleado solicitado no existe.',
            content: {
              'text/plain': {
                schema: { type: 'string' },
                example: 'El empleado con id E999 no existe',
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
      Employee: {
        type: 'object',
        additionalProperties: false,
        required: requiredEmployeeProperties,
        properties: {
          ...employeeProperties,
          estado: { type: 'string', enum: ['ACTIVO', 'EN_VACACIONES', 'RETIRADO'] },
        },
      },
      CreateEmployeeRequest: {
        type: 'object',
        additionalProperties: false,
        required: requiredEmployeeProperties,
        properties: {
          ...employeeProperties,
          estado: {
            type: 'string',
            enum: ['ACTIVO'],
            description: 'En este reto solo se permite registrar empleados en estado ACTIVO.',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['error', 'code'],
        properties: {
          error: { type: 'string', example: 'El email juan.perez@empresa.com ya está registrado' },
          code: { type: 'string', example: 'DUPLICATE_EMAIL' },
        },
      },
      ValidationErrorResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['error', 'code', 'details'],
        properties: {
          error: { type: 'string', example: 'Datos de entrada inválidos' },
          code: { type: 'string', enum: ['VALIDATION_ERROR'] },
          details: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'message'],
              properties: {
                field: { type: 'string', example: 'email' },
                message: { type: 'string', example: 'email debe tener un formato válido' },
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
            example: { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
          },
        },
      },
    },
  },
} as const;
