import type { Employee, NewEmployee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';
import type { DepartmentGateway } from '../../domain/gateways/department.gateway.ts';
import type { EventPublisher } from '../../domain/gateways/event-publisher.gateway.ts';
import { HTTP_STATUS } from '../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../shared/constants/response-messages.constants.ts';
import { EVENT_TYPES } from '../../shared/constants/event-types.constants.ts';

export class RegisterEmployee {
  private readonly repository: EmployeeRepository;

  private readonly departmentGateway: DepartmentGateway;

  private readonly eventPublisher: EventPublisher;

  constructor(
    repository: EmployeeRepository,
    departmentGateway: DepartmentGateway,
    eventPublisher: EventPublisher,
  ) {
    this.repository = repository;
    this.departmentGateway = departmentGateway;
    this.eventPublisher = eventPublisher;
  }

  async execute(input: NewEmployee): Promise<Employee> {
    const employee: Employee = {
      ...input,
      id: input.id.trim(),
      email: input.email.trim().toLowerCase(),
      numeroEmpleado: input.numeroEmpleado.trim(),
      estado: 'ACTIVO',
      fechaRetiro: null,
    };

    if (await this.repository.findByEmail(employee.email)) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmail(employee.email),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMAIL,
      );
    }
    if (await this.repository.findByEmployeeNumber(employee.numeroEmpleado)) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateEmployeeNumber(employee.numeroEmpleado),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_EMPLOYEE_NUMBER,
      );
    }

    if (!(await this.departmentGateway.existsById(employee.departamentoId))) {
      throw new AppError(
        RESPONSE_MESSAGES.department.notFound(employee.departamentoId),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DEPARTMENT_NOT_FOUND,
      );
    }

    if (await this.repository.findById(employee.id)) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.duplicateId(employee.id),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DUPLICATE_ID,
      );
    }

    const saved = await this.repository.save(employee);

    // El publish() de EventPublisher nunca rechaza: un fallo del broker se registra como log,
    // no como error de esta operación. El alta ya quedó persistida y responde 201 igual.
    await this.eventPublisher.publish({ type: EVENT_TYPES.EMPLOYEE_CREATED, data: saved });

    return saved;
  }
}
