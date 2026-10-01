import type { Employee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';
import type { DepartmentGateway } from '../../domain/gateways/department.gateway.ts';
import type { EventPublisher } from '../../domain/gateways/event-publisher.gateway.ts';
import { HTTP_STATUS } from '../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../shared/constants/response-messages.constants.ts';
import { EVENT_TYPES } from '../../shared/constants/event-types.constants.ts';

export interface UpdateEmployeeInput {
  readonly nombre: string;
  readonly apellido: string;
  readonly email: string;
  readonly cargo: string;
  readonly area: string;
  readonly departamentoId: string;
}

export class UpdateEmployee {
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

  async execute(id: string, input: UpdateEmployeeInput): Promise<Employee> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new AppError(
        RESPONSE_MESSAGES.employee.notFound(id),
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.EMPLOYEE_NOT_FOUND,
      );
    }

    if (existing.estado === 'RETIRADO') {
      throw new AppError(
        RESPONSE_MESSAGES.employee.cannotModifyRetired(id),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.EMPLOYEE_RETIRED,
      );
    }

    const email = input.email.trim().toLowerCase();
    if (email !== existing.email) {
      const conflict = await this.repository.findByEmail(email);
      if (conflict && conflict.id !== existing.id) {
        throw new AppError(
          RESPONSE_MESSAGES.employee.duplicateEmail(email),
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.DUPLICATE_EMAIL,
        );
      }
    }

    const departamentoId = input.departamentoId.trim();
    if (!(await this.departmentGateway.existsById(departamentoId))) {
      throw new AppError(
        RESPONSE_MESSAGES.department.notFound(departamentoId),
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.DEPARTMENT_NOT_FOUND,
      );
    }

    const updated: Employee = {
      ...existing,
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      email,
      cargo: input.cargo.trim(),
      area: input.area.trim(),
      departamentoId,
    };

    const saved = await this.repository.update(updated);

    // Igual que en RegisterEmployee: publish() nunca rechaza, un fallo del broker no afecta la
    // respuesta HTTP ni revierte la actualización ya persistida.
    await this.eventPublisher.publish({ type: EVENT_TYPES.EMPLOYEE_UPDATED, data: saved });

    return saved;
  }
}
