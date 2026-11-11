/**
 * Arranque de OpenTelemetry (Reto 8). Se carga ANTES que la aplicación con
 * `node --import ./dist/infrastructure/observability/tracing.js dist/server.js`: las
 * instrumentaciones solo pueden parchear http, express o pg si se registran antes de que la
 * aplicación los importe.
 *
 * - Exportador: Zipkin (OTEL_EXPORTER_ZIPKIN_ENDPOINT, nombre de red Docker `zipkin`).
 * - Propagación: W3C Trace Context + Baggage (cabeceras `traceparent`/`baggage`), el mismo
 *   estándar que usan los servicios en Python, Go, Ruby y PHP.
 * - Instrumentación automática: servidor HTTP/Express (spans de entrada), fetch/undici (llamada a
 *   departamentos-service) y pg (consultas a PostgreSQL). La propagación por RabbitMQ es manual
 *   (ver amqp-trace-context.ts).
 */
import { register } from 'node:module';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Hook ESM (import-in-the-middle): la aplicación es ESM y sin él las instrumentaciones no ven
// los módulos importados con `import`.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'empleados-service';
const zipkinUrl = process.env.OTEL_EXPORTER_ZIPKIN_ENDPOINT;

// Rutas que no aportan a una traza: el healthcheck de Docker y el scraping de Prometheus llegan
// cada pocos segundos y taparían las peticiones reales en Zipkin.
const NOISY_PATHS = new Set(['/health', '/metrics']);

// Sin OTEL_EXPORTER_ZIPKIN_ENDPOINT (pruebas, stack E2E del Reto 7) no se instala el SDK: la API
// queda en modo no-op y la aplicación funciona igual, sin exportar spans.
if (zipkinUrl) {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  );

  const provider = new TracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
    }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new ZipkinExporter({ url: zipkinUrl, serviceName }) })],
  });
  trace.setGlobalTracerProvider(provider);

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => NOISY_PATHS.has((request.url ?? '').split('?')[0]),
      }),
      // Solo el span del handler de la ruta; un span por middleware (helmet, json...) es ruido.
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE, ExpressLayerType.ROUTER] }),
      new UndiciInstrumentation(),
      new PgInstrumentation(),
    ],
  });

  const shutdown = (): void => {
    provider.shutdown().catch((error: unknown) => {
      console.error('OpenTelemetry shutdown failed', error);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
