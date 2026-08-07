import { Router } from 'express';
import { sendSuccess } from '../responses/api.response.ts';
import { HTTP_STATUS } from '../../../shared/constants/http-status.constants.ts';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  sendSuccess(res, HTTP_STATUS.OK, RESPONSE_MESSAGES.service.available, { status: 'UP' });
});

export default healthRouter;
