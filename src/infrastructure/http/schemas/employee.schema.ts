import { z } from 'zod';

const requiredText = (field: string) =>
  z.string({ error: `${field} es obligatorio` }).trim().min(1, `${field} no puede estar vacío`);

export const createEmployeeSchema = z
  .strictObject({
    id: requiredText('id'),
    nombre: requiredText('nombre'),
    apellido: requiredText('apellido'),
    email: z.email('email debe tener un formato válido').trim().toLowerCase(),
    numeroEmpleado: requiredText('numeroEmpleado'),
    cargo: requiredText('cargo'),
    area: requiredText('area'),
    departamentoId: requiredText('departamentoId'),
    fechaIngreso: z.iso.date('fechaIngreso debe tener el formato YYYY-MM-DD'),
    estado: z.literal('ACTIVO', { error: 'estado debe ser ACTIVO en este reto' }),
  });

export const employeeIdSchema = z.string().trim().min(1, 'id no puede estar vacío');
