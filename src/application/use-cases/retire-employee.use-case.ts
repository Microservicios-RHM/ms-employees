import type { Employee } from '../../domain/entities/employee.entity.ts';
import { AppError } from '../../domain/errors/app.error.ts';
import type { EmployeeRepository } from '../../domain/repositories/employee.repository.ts';
import type { EventPublisher } from '../../domain/gateways/event-publisher.gateway.ts';
import { HTTP_STATUS } from '../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../shared/constants/error-codes.constants.ts';
import { RESPONSE_MESSAGES } from '../../shared/constants/response-messages.constants.ts';
import { EVENT_TYPES } from '../../shared/constants/event-types.constants.ts';

export class RetireEmployee {
  private readonly repository: EmployeeRepository;

  private readonly eventPublisher: EventPublisher;

  constructor(repository: EmployeeRepository, eventPublisher: EventPublisher) {
    this.repository = repository;
    this.eventPublisher = eventPublisher;
  }

  async execute(id: string): Promise<Employee> {
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

    // Baja lógica (regla del Reto 0): nunca se borra físicamente, solo se transiciona el estado y
    // se registra fechaRetiro.
    const fechaRetiro = new Date().toISOString();
    const saved = await this.repository.retire(id, fechaRetiro);

    await this.eventPublisher.publish({ type: EVENT_TYPES.EMPLOYEE_RETIRED, data: saved });

    return saved;
  }
}
