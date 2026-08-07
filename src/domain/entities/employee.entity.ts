export const EMPLOYEE_STATUSES = ['ACTIVO', 'EN_VACACIONES', 'RETIRADO'] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly email: string;
  readonly numeroEmpleado: string;
  readonly cargo: string;
  readonly area: string;
  readonly departamentoId: string;
  readonly fechaIngreso: string;
  readonly estado: EmployeeStatus;
}

export type NewEmployee = Employee;
