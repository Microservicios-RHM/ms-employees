export const createEmployeesMigration = {
  version: 1,
  name: 'create_employees',
  sql: `
    CREATE TABLE employees.employees (
      id VARCHAR(50) PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL,
      numero_empleado VARCHAR(50) NOT NULL,
      cargo VARCHAR(150) NOT NULL,
      area VARCHAR(100) NOT NULL,
      departamento_id VARCHAR(50) NOT NULL,
      fecha_ingreso DATE NOT NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT employees_estado_check CHECK (estado IN ('ACTIVO', 'EN_VACACIONES', 'RETIRADO')),
      CONSTRAINT employees_numero_empleado_key UNIQUE (numero_empleado)
    );

    CREATE UNIQUE INDEX employees_email_unique_idx ON employees.employees (lower(email));
    CREATE INDEX employees_departamento_id_idx ON employees.employees (departamento_id);
    CREATE INDEX employees_estado_idx ON employees.employees (estado);
  `,
} as const;
