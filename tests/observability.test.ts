import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { createHealthHandler, evaluateHealth } from '../src/infrastructure/observability/health.ts';
import { UNMATCHED_ROUTE, createHttpMetrics, routeTemplate } from '../src/infrastructure/observability/metrics.ts';
import { withPublishSpan } from '../src/infrastructure/observability/amqp-trace-context.ts';
import { traceContextFields } from '../src/infrastructure/logging/pino.logger.ts';

describe('Health check (Reto 8)', () => {
  test('reporta UP cuando todas las dependencias responden', async () => {
    const report = await evaluateHealth('empleados-service', {
      database: async () => true,
      messageBroker: () => true,
    });
    assert.deepEqual(report, {
      status: 'UP',
      service: 'empleados-service',
      checks: { database: 'UP', messageBroker: 'UP' },
    });
  });

  test('reporta DOWN si una dependencia falla, lanza un error o no responde a tiempo', async () => {
    const report = await evaluateHealth(
      'empleados-service',
      {
        database: async () => {
          throw new Error('connection refused');
        },
        messageBroker: () => false,
        slow: () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 200)),
        ok: () => true,
      },
      20,
    );
    assert.equal(report.status, 'DOWN');
    assert.deepEqual(report.checks, { database: 'DOWN', messageBroker: 'DOWN', slow: 'DOWN', ok: 'UP' });
  });

  test('responde 503 con el detalle de los checks cuando el servicio está degradado', async () => {
    const app = express();
    app.get('/health', createHealthHandler('empleados-service', { database: () => false, messageBroker: () => true }));

    const response = await request(app).get('/health').expect(503);
    assert.deepEqual(response.body, {
      status: 'DOWN',
      service: 'empleados-service',
      checks: { database: 'DOWN', messageBroker: 'UP' },
    });
  });
});

describe('Métricas Prometheus (Reto 8)', () => {
  function createMeteredApp() {
    const metrics = createHttpMetrics('empleados-service', false);
    const app = express();
    app.use(metrics.middleware);
    app.get('/metrics', metrics.handler);
    const router = express.Router();
    router.get('/:id', (req, res) => {
      res.status(req.params.id === 'E404' ? 404 : 200).json({ id: req.params.id });
    });
    app.use('/empleados', router);
    app.use((_req, res) => {
      res.status(404).end();
    });
    return app;
  }

  test('cuenta peticiones y latencia por plantilla de ruta y código, sin el id real', async () => {
    const app = createMeteredApp();
    await request(app).get('/empleados/E001').expect(200);
    await request(app).get('/empleados/E002').expect(200);
    await request(app).get('/empleados/E404').expect(404);
    await request(app).get('/no-existe').expect(404);

    const response = await request(app).get('/metrics').expect(200);
    assert.match(response.headers['content-type'], /text\/plain/);
    const body = response.text;
    assert.match(body, /http_requests_total\{method="GET",route="\/empleados\/:id",status="200",service="empleados-service"\} 2/);
    assert.match(body, /http_requests_total\{method="GET",route="\/empleados\/:id",status="404",service="empleados-service"\} 1/);
    assert.match(body, new RegExp(`http_requests_total\\{method="GET",route="${UNMATCHED_ROUTE}",status="404"`));
    assert.match(body, /http_request_duration_seconds_count\{service="empleados-service",method="GET",route="\/empleados\/:id",status="200"\} 2/);
    assert.doesNotMatch(body, /E001|\/metrics"/);
  });

  test('incluye las métricas de proceso (CPU y memoria) cuando se recolectan las métricas por defecto', async () => {
    const metrics = createHttpMetrics('empleados-service');
    const body = await metrics.registry.metrics();
    assert.match(body, /process_cpu_seconds_total/);
    assert.match(body, /process_resident_memory_bytes/);
  });

  test('normaliza la plantilla de ruta', () => {
    assert.equal(routeTemplate({ baseUrl: '/empleados', route: { path: '/' } }), '/empleados');
    assert.equal(routeTemplate({ baseUrl: '', route: { path: '/' } }), '/');
    assert.equal(routeTemplate({ baseUrl: '', route: undefined }), UNMATCHED_ROUTE);
  });
});

describe('Propagación de traza por RabbitMQ (Reto 8)', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });

  before(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(provider);
  });

  after(async () => {
    await provider.shutdown();
    trace.disable();
    propagation.disable();
    context.disable();
  });

  test('crea un span PRODUCER e inyecta su traceparent en las cabeceras del mensaje', async () => {
    exporter.reset();
    let logFields: Record<string, string> = {};
    const headers = await withPublishSpan('rhm.events', 'empleado.creado', (messageHeaders) => {
      logFields = traceContextFields();
      return messageHeaders;
    });

    const [span] = exporter.getFinishedSpans();
    assert.equal(span.name, 'empleado.creado publish');
    assert.equal(span.kind, SpanKind.PRODUCER);
    assert.equal(span.attributes['messaging.rabbitmq.destination.routing_key'], 'empleado.creado');
    const { traceId, spanId } = span.spanContext();
    assert.equal(headers.traceparent, `00-${traceId}-${spanId}-01`);
    assert.deepEqual(logFields, { traceId, spanId });
  });

  test('marca el span con error si la publicación falla', async () => {
    exporter.reset();
    await assert.rejects(
      withPublishSpan('rhm.events', 'empleado.retirado', () => {
        throw new Error('channel closed');
      }),
      /channel closed/,
    );
    const [span] = exporter.getFinishedSpans();
    assert.equal(span.status.code, SpanStatusCode.ERROR);
  });

  test('no agrega campos de traza al log fuera de un span', () => {
    assert.deepEqual(traceContextFields(), {});
  });
});
