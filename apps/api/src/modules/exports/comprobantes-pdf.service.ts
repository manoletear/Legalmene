import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require("pdfkit");
import { Writable } from "stream";
import { ESTADO_PROVISION_LABEL, type EstadoProvision } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { planes } from "../../db/schema/planes";
import { competencias, materias } from "../../db/schema/maestros";
import { usuarios } from "../../db/schema/usuarios";
import { arancelesAtencion } from "../../db/schema/finanzas";
import { provisiones } from "../../db/schema/provisiones";

export const MEDIO_PAGO_LABEL: Record<string, string> = {
  CasaCentral: "Pago en casa central",
  Transferencia: "Transferencia bancaria",
  WebPay: "WebPay",
};

const clp = (n: number | null | undefined) => (n == null ? "—" : "$ " + n.toLocaleString("es-CL"));
const uf = (centesimas: number | null | undefined) =>
  centesimas == null ? "—" : `${(centesimas / 100).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
const fecha = (d: Date | string | null | undefined) =>
  !d ? "—" : typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("-") : new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" });

export interface Comprobante {
  titulo: string;
  numero: string;
  // Destinatario de cada copia (una página por copia).
  copias: string[];
  secciones: { titulo: string; filas: [string, string][] }[];
  nota?: string;
  firmas: string[];
}

// Dibuja un comprobante: una página por copia, con su destinatario, los datos y las firmas.
export function dibujarComprobante(c: Comprobante, output: Writable): void {
  const doc = new PDFDocument({ margin: 50, size: "LETTER", info: { Title: `${c.titulo} ${c.numero}` } });
  doc.pipe(output);
  c.copias.forEach((copia, i) => {
    if (i > 0) doc.addPage();
    doc.fillColor("#1e3a8a").font("Helvetica-Bold").fontSize(18).text("LegalChile", 50, 50);
    doc.fillColor("#64748b").font("Helvetica").fontSize(9).text("NEXUS · Sistema de gestión legal", 50, 72);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10).text(`Copia ${i + 1} de ${c.copias.length}: ${copia}`, 300, 55, { width: 262, align: "right" });
    doc.moveTo(50, 92).lineTo(562, 92).strokeColor("#cbd5e1").stroke();

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(15).text(c.titulo, 50, 108);
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text(`N° ${c.numero}`);
    doc.moveDown(1);

    for (const s of c.secciones) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a").text(s.titulo);
      doc.moveDown(0.3);
      for (const [k, v] of s.filas) {
        const y = doc.y;
        doc.font("Helvetica").fontSize(10).fillColor("#475569").text(k, 60, y, { width: 180 });
        doc.font("Helvetica-Bold").fillColor("#0f172a").text(v, 250, y, { width: 312 });
        doc.moveDown(0.25);
      }
      doc.moveDown(0.7);
    }
    if (c.nota) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#475569").text(c.nota, 50, doc.y, { width: 512 });
    }

    // Firmas al pie.
    const yFirmas = 640;
    const ancho = 512 / c.firmas.length;
    c.firmas.forEach((f, j) => {
      const x = 50 + j * ancho;
      doc.moveTo(x + 15, yFirmas).lineTo(x + ancho - 15, yFirmas).strokeColor("#94a3b8").stroke();
      doc.font("Helvetica").fontSize(9).fillColor("#475569").text(f, x, yFirmas + 6, { width: ancho, align: "center" });
    });
    doc.font("Helvetica").fontSize(8).fillColor("#94a3b8").text(`Emitido el ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`, 50, 720, { width: 512, align: "center" });
  });
  doc.end();
}

// Comprobantes de pago para el cliente (Anexo §IX 5.4 y §X 05.1).
@Injectable()
export class ComprobantesPdfService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async atencion(atencionId: string) {
    const [a] = await this.db
      .select({
        id: atenciones.id,
        correlativo: atenciones.correlativo,
        tipo: atenciones.tipo,
        asunto: atenciones.asunto,
        codPlan: atenciones.codPlan,
        plan: planes.nombre,
        competencia: competencias.nombre,
        materia: materias.nombre,
        rut: afiliados.rut,
        nombres: afiliados.nombres,
        apellidoPaterno: afiliados.apellidoPaterno,
        apellidoMaterno: afiliados.apellidoMaterno,
      })
      .from(atenciones)
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .innerJoin(planes, eq(planes.codPlan, atenciones.codPlan))
      .innerJoin(competencias, eq(competencias.id, atenciones.competenciaId))
      .innerJoin(materias, eq(materias.id, atenciones.materiaId))
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return a;
  }

  private seccionAtencion(a: Awaited<ReturnType<ComprobantesPdfService["atencion"]>>) {
    return {
      titulo: "Cliente y atención",
      filas: [
        ["Cliente", `${a.nombres} ${a.apellidoPaterno} ${a.apellidoMaterno ?? ""}`.trim()],
        ["RUT", a.rut],
        ["Plan", `${a.codPlan} — ${a.plan}`],
        ["Atención", `${a.correlativo} (${a.tipo})`],
        ["Materia", `${a.competencia} / ${a.materia}`],
        ["Asunto", a.asunto],
      ] as [string, string][],
    };
  }

  private async nombreUsuario(id: string | null) {
    if (!id) return "—";
    const [u] = await this.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, id));
    return u?.nombre ?? "—";
  }

  // Recibo del pago del arancel en dos copias (administración y cliente). No aplica a WebPay.
  async reciboArancel(atencionId: string): Promise<Comprobante> {
    const a = await this.atencion(atencionId);
    const [ar] = await this.db.select().from(arancelesAtencion).where(eq(arancelesAtencion.atencionId, atencionId));
    if (!ar || ar.estado !== "Pagado") throw new ConflictException("El arancel de esta atención no registra un pago");
    if (ar.medioPago === "WebPay") throw new ConflictException("Los pagos por WebPay tienen su propio comprobante");
    return {
        titulo: "Comprobante de pago de arancel",
        numero: `${a.correlativo}-ARA`,
        copias: ["Administración", "Cliente"],
        secciones: [
          this.seccionAtencion(a),
          {
            titulo: "Pago",
            filas: [
              ["Fecha de pago", fecha(ar.fechaPago)],
              ["Forma de pago", MEDIO_PAGO_LABEL[ar.medioPago ?? ""] ?? ar.medioPago ?? "—"],
              ["Copago", uf(ar.copagoUfCentesimas)],
              ["Valor UF del día", ar.ufValorCentavos == null ? "—" : clp(Math.round(ar.ufValorCentavos / 100))],
              ["Monto pagado", clp(ar.montoClp)],
              ["Registrado por", await this.nombreUsuario(ar.registradoPorId)],
            ],
          },
        ],
        nota: "El monto en pesos se calcula con el valor de la UF del día del pago.",
        firmas: ["Firma y timbre LegalChile", "Firma del cliente"],
    };
  }

  // Recibo del dinero entregado por el cliente para una provisión de fondos, en dos copias.
  async reciboProvision(provisionId: string): Promise<Comprobante> {
    const [p] = await this.db.select().from(provisiones).where(eq(provisiones.id, provisionId));
    if (!p) throw new NotFoundException(`Provisión ${provisionId} no existe`);
    const a = await this.atencion(p.atencionId);
    if (!p.fechaPagoCliente) throw new ConflictException("La provisión aún no registra el pago del cliente");
    return {
        titulo: "Comprobante de recepción de provisión de fondos",
        numero: `${a.correlativo}-PF-${p.id.slice(0, 8).toUpperCase()}`,
        copias: ["Administración", "Cliente"],
        secciones: [
          this.seccionAtencion(a),
          {
            titulo: "Provisión",
            filas: [
              ["Motivo", p.motivo],
              ["Monto recibido", clp(p.monto)],
              ["Fecha de pago", fecha(p.fechaPagoCliente)],
              ["Forma de pago", MEDIO_PAGO_LABEL[p.medioPagoCliente ?? ""] ?? p.medioPagoCliente ?? "—"],
              ["Estado actual", ESTADO_PROVISION_LABEL[p.estado as EstadoProvision] ?? p.estado],
            ],
          },
        ],
        nota: "Los fondos se destinan a los gastos del caso y se rinden al cliente al término de la atención.",
        firmas: ["Firma y timbre LegalChile", "Firma del cliente"],
    };
  }
}
