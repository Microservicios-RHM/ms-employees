import express from 'express';
import healthRouter from './routers/health.router.ts';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use('/', healthRouter);

app.use((_req, res) => {
    res.status(404).type('text/plain').send('Recurso no encontrado');
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof SyntaxError ? 'El cuerpo no es JSON válido.' : 'Error interno del servidor.';
    res.status(err instanceof SyntaxError ? 400 : 500).json({ error: message });
});

export default app;