import http from 'node:http';
import app from './app.ts';

const port = Number(process.env.PORT ?? 8080);
const server = http.createServer(app);

server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor de empleados escuchando en http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} recibido. Cerrando el servidor...`);
  server.close((error) => {
    if (error) {
      console.error('No fue posible cerrar el servidor correctamente.', error);
      process.exit(1);
    }
    process.exit(0);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => shutdown(signal));
}
