import http from 'node:http';
import app from './app.ts';

const PORT = Number(process.env.PORT ?? 8080);
const servidor = http.createServer(app);

servidor.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de empleados escuchando en http://localhost:${PORT}`);
});

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => servidor.close(() => process.exit(0)));
}