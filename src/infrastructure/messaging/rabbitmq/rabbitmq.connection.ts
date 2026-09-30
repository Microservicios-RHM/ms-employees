import amqplib, { type Channel, type ChannelModel } from 'amqplib';
import type { Logger } from 'pino';

export interface RabbitMqConnectionConfig {
  readonly url: string;
  readonly connectMaxAttempts: number;
  readonly connectRetryDelayMs: number;
}

/**
 * El broker es una dependencia best-effort (ver README): si no puede conectarse tras agotar los
 * reintentos, el servicio sigue arrancando y cada publish() posterior queda registrado como fallo
 * en vez de tumbar el proceso.
 */
export class RabbitMqConnection {
  private readonly config: RabbitMqConnectionConfig;
  private readonly logger: Logger;
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(config: RabbitMqConnectionConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async connect(): Promise<void> {
    for (let attempt = 1; attempt <= this.config.connectMaxAttempts; attempt += 1) {
      try {
        this.connection = await amqplib.connect(this.config.url);
        this.channel = await this.connection.createChannel();
        this.registerRecoveryHandlers();
        this.logger.info('RabbitMQ connection ready');
        return;
      } catch (error) {
        this.logger.warn({ err: error, attempt }, 'RabbitMQ connection attempt failed');
        if (attempt < this.config.connectMaxAttempts) {
          await this.delay(this.config.connectRetryDelayMs * attempt);
        }
      }
    }
    this.logger.error(
      'RabbitMQ unavailable after all connection attempts; event publishing will be degraded',
    );
  }

  async ensureChannel(): Promise<Channel | null> {
    if (this.channel) return this.channel;
    await this.connect();
    return this.channel;
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = null;
    this.connection = null;
  }

  private registerRecoveryHandlers(): void {
    this.connection?.on('error', (error) => {
      this.logger.warn({ err: error }, 'RabbitMQ connection error');
      this.channel = null;
      this.connection = null;
    });
    this.connection?.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      this.channel = null;
      this.connection = null;
    });
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
