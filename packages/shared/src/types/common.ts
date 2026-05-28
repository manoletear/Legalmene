import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const RutSchema = z
  .string()
  .regex(/^\d{1,8}-[\dkK]$/, "RUT debe tener formato 12345678-9");

export const IsoDateSchema = z.string().datetime();

export type UUID = string;
