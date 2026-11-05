import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require("pdfkit");
import { Writable } from "stream";
import { CALIDAD_HEREDERO_LABEL, ESTADO_LABEL } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { usuarios } from "../../db/schema/usuarios";
import { PosesionesService } from "./posesiones.service";

const fechaCl = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("-") : "—");

// "Ficha de antecedentes para posesión efectiva": resumen interno para preparar el trámite.
// NO es el formulario oficial del Registro Civil (pendiente de definir en discovery).
@Injectable()
export class PosesionPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PosesionesService) private readonly posesiones: PosesionesService,
  ) {}

  async generar(atencionId: string, output: Writable): Promise<void> {
    const pe = await this.posesiones.obtener(atencionId);
    const [a] = await this.db
      .select({
        correlativo: atenciones.correlativo,
        estado: atenciones.estado,
        codPlan: atenciones.codPlan,
        fechaApertura: atenciones.fechaApertura,
        rut: afiliados.rut,
        nombres: afiliados.nombres,
        apellidoPaterno: afiliados.apellidoPaterno,
        apellidoMaterno: afiliados.apellidoMaterno,
        telefono: afiliados.telefono,
        email: afiliados.email,
        abogado: usuarios.nombre,
      })
      .from(atenciones)
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .leftJoin(usuarios, eq(usuarios.id, atenciones.abogadoAsignadoId))
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!a) throw new NotFoundException(`Posesión efectiva ${atencionId} no existe`);

    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    doc.pipe(output);
    const titulo = (t: string) => doc.moveDown(0.8).fontSize(12).fillColor("#1976d2").text(t).moveDown(0.3).fontSize(10).fillColor("#000");
    const campo = (k: string, v: string | null | undefined) => doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v || "—");

    doc.fillColor("#1976d2").fontSize(18).text("Ficha de antecedentes para posesión efectiva");
    doc.moveDown(0.3).fillColor("#b91c1c").fontSize(9)
      .text("Resumen interno de LegalChile para preparar el trámite. No es el formulario oficial del Servicio de Registro Civil e Identificación ni reemplaza la solicitud que se presenta ante ese servicio.");
    doc.fillColor("#000").moveDown(0.5).fontSize(10);
    campo("Atención", `${a.correlativo} · ${ESTADO_LABEL[a.estado]}`);
    campo("Plan", a.codPlan);
    campo("Fecha de ingreso", a.fechaApertura.toLocaleDateString("es-CL", { timeZone: "America/Santiago" }));
    campo("Abogado", a.abogado);

    titulo("Solicitante (afiliado)");
    campo("Nombre", `${a.nombres} ${a.apellidoPaterno} ${a.apellidoMaterno ?? ""}`.trim());
    campo("RUT", a.rut);
    campo("Contacto", [a.telefono, a.email].filter(Boolean).join(" · "));

    titulo("Causante");
    campo("Nombre", pe.causanteNombre);
    campo("RUT", pe.causanteRut);
    campo("Fecha de defunción", fechaCl(pe.causanteFechaDefuncion));
    campo("Último domicilio", [pe.causanteUltimoDomicilio, pe.causanteComuna].filter(Boolean).join(", "));

    titulo(`Herederos (${pe.herederos.length})`);
    if (pe.herederos.length === 0) doc.fillColor("#999").text("Sin herederos registrados.").fillColor("#000");
    pe.herederos.forEach((h, i) => {
      doc.font("Helvetica-Bold").text(`${i + 1}. ${h.nombre}`, { continued: true }).font("Helvetica").text(`  ·  RUT ${h.rut}  ·  ${CALIDAD_HEREDERO_LABEL[h.calidad]}`);
      const extra = [h.domicilio, h.telefono, h.email].filter(Boolean).join(" · ");
      if (extra) doc.fontSize(9).fillColor("#444").text(extra, { indent: 14 }).fillColor("#000").fontSize(10);
    });

    if (pe.observaciones) {
      titulo("Observaciones");
      doc.text(pe.observaciones, { align: "justify" });
    }
    doc.moveDown(1.5).fontSize(8).fillColor("#777").text(`Generado el ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`);
    doc.end();
  }
}
