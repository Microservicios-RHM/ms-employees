export interface DomainEvent<T = unknown> {
  readonly type: string;
  readonly data: T;
}

/**
 * Contrato: implementaciones NUNCA deben rechazar la promesa. Un fallo al publicar (broker caído,
 * timeout, etc.) debe registrarse internamente y resolver de todas formas — la operación de
 * dominio que ya se persistió no debe revertirse ni fallar por esto.
 */
export interface EventPublisher {
  publish<T>(event: DomainEvent<T>): Promise<void>;
}
