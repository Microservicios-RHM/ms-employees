import { Router } from 'express';
import type { DepartmentCatalogCacheManager } from '../clients/http-department.client.ts';
import { sendSuccess } from '../responses/api.response.ts';
import { sendError } from '../responses/api.response.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { ERROR_CODES } from '../../../shared/constants/error-codes.constants.ts';

export function createDepartmentCacheRouter(
  cacheManager: DepartmentCatalogCacheManager,
  adminToken: string,
): Router {
  const router = Router();

  router.delete('/cache/departamentos', (request, response) => {
    if (request.header('x-cache-admin-token') !== adminToken) {
      return sendError(
        response,
        HTTP_STATUS.UNAUTHORIZED,
        'Token de administración de caché inválido',
        ERROR_CODES.UNAUTHORIZED,
        request.originalUrl,
      );
    }

    const removed = cacheManager.clearCatalog();
    return sendSuccess(response, 200, 'Cache limpiado correctamente', { removed });
  });

  return router;
}
