import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, desc } from "drizzle-orm";
import PDFDocument = require("pdfkit");
import { Writable } from "stream";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { gestiones } from "../../db/schema/gestiones";
import { comites } from "../../db/schema/comites";

@Injectable()
export class AtencionPdfService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Genera un PDF con el detalle de una atención: cabecera, afiliado,
  // timeline de gestiones y comités. Útil para legajo físico/escritos.
  async generar(codPlan: string, atencionId: string, output: Writable): Promise<void> {
    const [a] = await this.db
      .select()
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), eq(atenciones.codPlan, codPlan)));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe en plan ${codPlan}`);

    const [afi] = await this.db.select().from(afiliados).where(eq(afiliados.id, a.afiliadoId));
    const gs = await this.db
      .select()
      .from(gestiones)
      .where(eq(gestiones.atencionId, atencionId))
      .orderBy(desc(gestiones.createdAt));
    const cs = await this.db.select().from(comites).where(eq(comites.atencionId, atencionId));

    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    doc.pipe(output);

    doc.fillColor("#1976d2").fontSize(20).text("LegalChile · PSL", { align: "right" });
    doc.fillColor("#000").fontSize(10).text(`Plan ${codPlan}`, { align: "right" });
    doc.moveDown(1.5);

    doc.fontSize(16).text(a.correlativo, { continued: true }).fontSize(12).text(`  ·  ${a.tipo}`);
    doc.fontSize(11).fillColor("#555").text(`Estado: ${a.estado} · Prioridad: ${a.prioridad} · Competencia: ${a.competencia}`);
    doc.moveDown(0.5);
    doc.fillColor("#000").fontSize(13).text(a.materia, { underline: false });
    if (a.descripcion) {
      doc.moveDown(0.3).fontSize(10).fillColor("#444").text(a.descripcion, { align: "justify" });
    }
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#1976d2").text("Afiliado").moveDown(0.3);
    doc.fontSize(10).fillColor("#000");
    if (afi) {
      doc.text(`${afi.apellidoPaterno} ${afi.apellidoMaterno ?? ""}, ${afi.nombres}`);
      doc.text(`RUT ${afi.rut}${afi.email ? "  ·  " + afi.email : ""}${afi.telefono ? "  ·  " + afi.telefono : ""}`);
    } else {
      doc.text("Afiliado no encontrado");
    }
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#1976d2").text(`Gestiones (${gs.length})`).moveDown(0.3);
    doc.fontSize(10).fillColor("#000");
    if (gs.length === 0) doc.fillColor("#999").text("Sin gestiones registradas.").fillColor("#000");
    for (const g of gs) {
      const fecha = (g.fechaEjecucion ?? g.fechaCompromiso ?? g.createdAt).toISOString().slice(0, 16).replace("T", " ");
      doc
        .font("Helvetica-Bold")
        .text(`${fecha}  ${g.tipo}  [${g.estado}]`, { continued: true })
        .font("Helvetica")
        .text(`  ${g.titulo}`);
      if (g.detalle) doc.fontSize(9).fillColor("#444").text(g.detalle, { indent: 12 }).fillColor("#000").fontSize(10);
      if (g.resultado) doc.fontSize(9).fillColor("#388e3c").text(`Resultado: ${g.resultado}`, { indent: 12 }).fillColor("#000").fontSize(10);
      doc.moveDown(0.4);
    }
    doc.moveDown(0.5);

    doc.fontSize(12).fillColor("#1976d2").text(`Comités (${cs.length})`).moveDown(0.3);
    doc.fontSize(10).fillColor("#000");
    if (cs.length === 0) doc.fillColor("#999").text("Sin comités convocados.").fillColor("#000");
    for (const c of cs) {
      doc.font("Helvetica-Bold").text(`${c.fechaConvocatoria.toISOString().slice(0, 10)}  [${c.estado}]  ${c.decision}`);
      doc.font("Helvetica").fontSize(9).text(c.motivo, { indent: 12 });
      if (c.acta) doc.text(`Acta: ${c.acta}`, { indent: 12 });
      doc.fontSize(10).moveDown(0.4);
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor("#999").text(
      `Generado el ${new Date().toISOString()} · Sistema PSL LegalChile · Documento confidencial`,
      { align: "center" },
    );

    doc.end();
  }
}
