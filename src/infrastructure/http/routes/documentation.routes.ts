import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../openapi/openapi.document.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';

const documentationRouter = Router();

// Montadas bajo /empleados para poder vivir detrás del Gateway sin reescritura de rutas: el
// Gateway ya proxea /empleados/* preservando la ruta, así que /empleados/docs y
// /empleados/openapi.json quedan alcanzables automáticamente en http://localhost:8080.
// Se registran antes que el router de empleados (ver app.ts), así que "docs" nunca se interpreta
// como un :id de empleado.
documentationRouter.get('/empleados/openapi.json', (_req, res) => {
  res.status(HTTP_STATUS.OK).json(openApiDocument);
});

documentationRouter.use(
  '/empleados/docs',
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'Empleados API | Swagger UI',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: true,
    },
  }),
);

export default documentationRouter;
