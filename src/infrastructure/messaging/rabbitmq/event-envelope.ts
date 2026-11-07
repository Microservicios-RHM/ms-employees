export interface EventEnvelope<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly occurredAt: string;
  readonly producer: string;
  readonly data: T;
}

export function parseEnvelope(raw: string): EventEnvelope {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof (parsed as EventEnvelope).id !== 'string' ||
    typeof (parsed as EventEnvelope).type !== 'string' ||
    typeof (parsed as EventEnvelope).data !== 'object'
  ) {
    throw new Error('El mensaje no respeta el envelope del catÃ¡logo de eventos');
  }
  return parsed as EventEnvelope;
}
