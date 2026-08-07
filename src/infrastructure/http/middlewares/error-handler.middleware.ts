import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../../domain/errors/app.error.ts';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Datos de entrada inválidos',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.code === 'EMPLOYEE_NOT_FOUND') {
      res.status(error.statusCode).type('text/plain').send(error.message);
      return;
    }
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'El cuerpo no es JSON válido', code: 'INVALID_JSON' });
    return;
  }

  console.error('Error no controlado:', error);
  res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL_ERROR' });
};
