import { z } from 'zod';
import { RESPONSE_MESSAGES } from '../../../shared/constants/response-messages.constants.ts';

const requiredText = (field: string, maxLength: number) =>
  z
    .string({ error: RESPONSE_MESSAGES.validation.required(field) })
    .trim()
    .min(1, RESPONSE_MESSAGES.validation.notEmpty(field))
    .max(maxLength, RESPONSE_MESSAGES.validation.maxLength(field, maxLength));

export const createEmployeeSchema = z
  .strictObject({
    id: requiredText('id', 50),
    nombre: requiredText('nombre', 100),
    apellido: requiredText('apellido', 100),
    email: z.email(RESPONSE_MESSAGES.validation.invalidEmail).trim().toLowerCase().max(254, RESPONSE_MESSAGES.validation.maxLength('email', 254)),
    numeroEmpleado: requiredText('numeroEmpleado', 50),
    cargo: requiredText('cargo', 150),
    area: requiredText('area', 100),
    departamentoId: requiredText('departamentoId', 50),
    fechaIngreso: z.iso.date(RESPONSE_MESSAGES.validation.invalidEntryDate),
  });

export const employeeIdSchema = z
  .string()
  .trim()
  .min(1, RESPONSE_MESSAGES.validation.notEmpty('id'))
  .max(50, RESPONSE_MESSAGES.validation.maxLength('id', 50));
