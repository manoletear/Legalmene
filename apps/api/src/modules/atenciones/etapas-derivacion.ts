import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { atenciones } from "../../db/schema/atenciones";

// Atención creada al aprobar la derivación (alias para unirla junto a la consulta de origen).
export const atencionDerivada = alias(atenciones, "atencion_derivada");

// Etapas de la atención derivada con sus fechas (Anexo §XI, Estado Derivación). Se usan en el
// listado y en la exportación para que muestren lo mismo.
export const columnasEtapasDerivacion = {
  derivadaCorrelativo: atencionDerivada.correlativo,
  derivadaEstado: atencionDerivada.estado,
  primerContactoAt: atencionDerivada.fechaPrimerContacto,
  arancelPagadoEn: sql<string | null>`(select aa.fecha_pago from aranceles_atencion aa where aa.atencion_id = ${atencionDerivada.id})`,
  primeraGestionAt: sql<Date | null>`(select min(g.fecha_ejecucion) from gestiones g where g.atencion_id = ${atencionDerivada.id} and g.estado = 'Completada')`,
  terminoAt: atencionDerivada.fechaCierre,
};
