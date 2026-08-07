export const RESPONSE_MESSAGES = {
  employee: {
    registered: 'Empleado registrado correctamente',
    retrieved: 'Empleado consultado correctamente',
    notFound: (id: string) => `El empleado con id ${id} no existe`,
    duplicateId: (id: string) => `El empleado con id ${id} ya existe`,
    duplicateEmail: (email: string) => `El email ${email} ya está registrado`,
    duplicateEmployeeNumber: (employeeNumber: string) =>
      `El número de empleado ${employeeNumber} ya está registrado`,
  },
  service: {
    available: 'Servicio disponible',
  },
  validation: {
    invalidInput: 'Datos de entrada inválidos',
    invalidJson: 'El cuerpo no es JSON válido',
    required: (field: string) => `${field} es obligatorio`,
    notEmpty: (field: string) => `${field} no puede estar vacío`,
    invalidEmail: 'email debe tener un formato válido',
    invalidEntryDate: 'fechaIngreso debe tener el formato YYYY-MM-DD',
    invalidInitialStatus: 'estado debe ser ACTIVO en este reto',
  },
  resource: {
    notFound: 'Recurso no encontrado',
  },
  server: {
    internalError: 'Error interno del servidor',
  },
} as const;
