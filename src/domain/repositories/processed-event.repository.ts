export interface ProcessedEventRepository {
  /** Returns true only for the first delivery of an event envelope id. */
  markAsProcessed(eventId: string): Promise<boolean>;
}
