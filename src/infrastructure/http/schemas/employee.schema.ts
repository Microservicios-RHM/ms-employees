import { z } from 'zod';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

const requiredText = (field: string) =>
  z
    .string({ error: RESPONSE_MESSAGES.validation.required(field) })
    .trim()
    .min(1, RESPONSE_MESSAGES.validation.notEmpty(field));

export const createEmployeeSchema = z
  .strictObject({
    id: requiredText('id'),
    nombre: requiredText('nombre'),
    apellido: requiredText('apellido'),
    email: z.email(RESPONSE_MESSAGES.validation.invalidEmail).trim().toLowerCase(),
    numeroEmpleado: requiredText('numeroEmpleado'),
    cargo: requiredText('cargo'),
    area: requiredText('area'),
    departamentoId: requiredText('departamentoId'),
    fechaIngreso: z.iso.date(RESPONSE_MESSAGES.validation.invalidEntryDate),
    estado: z.literal('ACTIVO', { error: RESPONSE_MESSAGES.validation.invalidInitialStatus }),
  });

export const employeeIdSchema = z
  .string()
  .trim()
  .min(1, RESPONSE_MESSAGES.validation.notEmpty('id'));
