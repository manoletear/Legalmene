import { sql } from "drizzle-orm";
import { atenciones } from "../../db/schema/atenciones";

// Columnas calculadas de las búsquedas de atenciones (Anexo §XI), compartidas por la pantalla y
// la exportación XLSX para que muestren lo mismo.

// Bienes cubiertos del afiliado bajo el plan de la atención (identificadores, separados por coma).
export const bienesDeAtencionSql = sql<string | null>`(select string_agg(b.identificador, ', ' order by b.identificador) from bienes_afiliado b where b.afiliado_id = ${atenciones.afiliadoId} and b.cod_plan = ${atenciones.codPlan} and b.vigencia <> 'Eliminado')`;

// Estado de la última derivación pedida desde una consulta.
export const estadoDerivacionSql = sql<string | null>`(select d.estado from derivaciones d where d.consulta_id = ${atenciones.id} order by d.created_at desc limit 1)`;
