import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../openapi/openapi.document.ts';

const documentationRouter = Router();

documentationRouter.get('/openapi.json', (_req, res) => {
  res.status(200).json(openApiDocument);
});

documentationRouter.use(
  '/docs',
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
