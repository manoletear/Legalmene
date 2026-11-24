import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require("pdfkit");
import { Writable } from "stream";
import { ESTADO_PROVISION_LABEL, TIPO_DOCUMENTO_LABEL, type EstadoProvision, type TipoDocumento } from "@legalmene/shared";
import { gestiones } from "../../db/schema/gestiones";
import { documentos } from "../../db/schema/documentos";
import { causasTermino } from "../../db/schema/maestros";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { planes } from "../../db/schema/planes";
import { competencias, materias } from "../../db/schema/maestros";
import { usuarios } from "../../db/schema/usuarios";
import { arancelesAtencion } from "../../db/schema/finanzas";
import { provisionMovimientos, provisiones, rendicionesCliente } from "../../db/schema/provisiones";

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
              ...(ar.cuotasPago ? ([["Cuotas", String(ar.cuotasPago)]] as [string, string][]) : []),
              ...(ar.referenciaPago ? ([["Referencia", ar.referenciaPago]] as [string, string][]) : []),
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
              ...(p.cuotasPagoCliente ? ([["Cuotas", String(p.cuotasPagoCliente)]] as [string, string][]) : []),
              ...(p.referenciaPagoCliente ? ([["Referencia", p.referenciaPagoCliente]] as [string, string][]) : []),
              ["Estado actual", ESTADO_PROVISION_LABEL[p.estado as EstadoProvision] ?? p.estado],
            ],
          },
        ],
        nota: "Los fondos se destinan a los gastos del caso y se rinden al cliente al término de la atención.",
        firmas: ["Firma y timbre LegalChile", "Firma del cliente"],
    };
  }

  // Anexo §X 19: comprobante de rendición de fondos al cliente en tres copias (dos para el
  // abogado, una de ellas firmada por el cliente, y una para Finanzas).
  async rendicionCliente(atencionId: string): Promise<Comprobante> {
    const a = await this.atencion(atencionId);
    const [r] = await this.db
      .select()
      .from(rendicionesCliente)
      .where(and(eq(rendicionesCliente.atencionId, atencionId), inArray(rendicionesCliente.estado, ["ChequeEmitido", "Entregada"])))
      .orderBy(desc(rendicionesCliente.chequeEn))
      .limit(1);
    if (!r) throw new ConflictException("La atención no tiene un cheque de devolución emitido");
    const provs = await this.db
      .select()
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId))
      .orderBy(asc(provisiones.fechaSolicitud));
    // Solo lo que el cliente efectivamente pagó (una solicitud impaga o rechazada no suma).
    const pagadas = provs.filter((p) => p.fechaPagoCliente && !["Solicitada", "Rechazada"].includes(p.estado));
    const movs = pagadas.length
      ? await this.db
          .select()
          .from(provisionMovimientos)
          .where(inArray(provisionMovimientos.provisionId, pagadas.map((p) => p.id)))
          .orderBy(asc(provisionMovimientos.fecha))
      : [];
    const gastos = movs.filter((m) => m.tipo === "Gasto");
    const totalPagado = pagadas.reduce((s, p) => s + p.monto, 0);
    const totalGastos = gastos.reduce((s, m) => s + m.monto, 0);
    return {
      titulo: "Rendición de fondos al cliente",
      numero: `${a.correlativo}-REN`,
      copias: ["Abogado", "Cliente (firma de recepción)", "Finanzas"],
      secciones: [
        this.seccionAtencion(a),
        {
          titulo: "Fondos provisionados por el cliente",
          filas: pagadas.map((p) => [`${fecha(p.fechaPagoCliente)} · ${p.motivo}`, clp(p.monto)] as [string, string]),
        },
        {
          titulo: "Gastos del caso",
          filas: gastos.length
            ? gastos.map((m) => [`${fecha(m.fecha)} · ${m.glosa}`, clp(m.monto)] as [string, string])
            : [["Sin gastos registrados", "—"]],
        },
        {
          titulo: "Resumen",
          filas: [
            ["Total provisionado", clp(totalPagado)],
            ["Total gastado", clp(totalGastos)],
            ["Devuelto al cliente", clp(r.monto)],
            ["Cheque N°", r.numeroCheque ?? "—"],
            ["Emitido por", `${await this.nombreUsuario(r.chequePorId)} el ${fecha(r.chequeEn)}`],
          ],
        },
      ],
      nota: "Con este documento LegalChile rinde al cliente los fondos provisionados para su atención.",
      firmas: ["Finanzas LegalChile", "Abogado responsable", "Cliente (recibí conforme)"],
    };
  }

  // Anexo §VII l.915 / §VIII l.1178: informe final al cliente con el resultado, las gestiones
  // realizadas, los documentos del caso y la rendición de los fondos provisionados.
  async informeFinal(atencionId: string): Promise<Comprobante> {
    const a = await this.atencion(atencionId);
    const [extra] = await this.db
      .select({ estado: atenciones.estado, fechaApertura: atenciones.fechaApertura, fechaCierre: atenciones.fechaCierre, causa: causasTermino.nombre, abogadoId: atenciones.abogadoAsignadoId })
      .from(atenciones)
      .leftJoin(causasTermino, eq(causasTermino.id, atenciones.causaTerminoId))
      .where(eq(atenciones.id, atencionId));
    const [gs, docs, provs, rend] = await Promise.all([
      this.db
        .select({ titulo: gestiones.titulo, fecha: gestiones.fechaEjecucion, resultado: gestiones.resultado })
        .from(gestiones)
        .where(and(eq(gestiones.atencionId, atencionId), eq(gestiones.estado, "Completada")))
        .orderBy(asc(gestiones.fechaEjecucion)),
      this.db
        .select({ nombre: documentos.nombre, tipo: documentos.tipo, fecha: documentos.fechaSubida })
        .from(documentos)
        .where(eq(documentos.atencionId, atencionId))
        .orderBy(asc(documentos.fechaSubida)),
      this.db.select().from(provisiones).where(eq(provisiones.atencionId, atencionId)),
      this.db
        .select({ monto: rendicionesCliente.monto })
        .from(rendicionesCliente)
        .where(and(eq(rendicionesCliente.atencionId, atencionId), inArray(rendicionesCliente.estado, ["ChequeEmitido", "Entregada"]))),
    ]);
    const pagadas = provs.filter((p) => p.fechaPagoCliente && !["Solicitada", "Rechazada"].includes(p.estado));
    const gastos = pagadas.length
      ? await this.db
          .select({ monto: provisionMovimientos.monto })
          .from(provisionMovimientos)
          .where(and(inArray(provisionMovimientos.provisionId, pagadas.map((p) => p.id)), eq(provisionMovimientos.tipo, "Gasto")))
      : [];
    const corto = (t: string | null, n = 90) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : (t ?? ""));
    const totalPagado = pagadas.reduce((x, p) => x + p.monto, 0);
    const totalGastos = gastos.reduce((x, m) => x + m.monto, 0);
    const devuelto = rend.reduce((x, r) => x + (r.monto ?? 0), 0);
    return {
      titulo: "Informe final de la atención",
      numero: `${a.correlativo}-INF`,
      copias: ["Cliente"],
      secciones: [
        this.seccionAtencion(a),
        {
          titulo: "Resultado",
          filas: [
            ["Estado", extra.estado],
            ["Inicio", fecha(extra.fechaApertura)],
            ["Término", extra.fechaCierre ? fecha(extra.fechaCierre) : "En curso"],
            ["Causa de término", extra.causa ?? "—"],
            ["Abogado", await this.nombreUsuario(extra.abogadoId)],
          ],
        },
        {
          titulo: "Gestiones realizadas",
          filas: gs.length
            ? gs.map((g) => [`${fecha(g.fecha)} · ${corto(g.titulo, 40)}`, corto(g.resultado) || "—"] as [string, string])
            : [["Sin gestiones completadas", "—"]],
        },
        {
          titulo: "Documentos del caso",
          filas: docs.length
            ? docs.map((d) => [`${fecha(d.fecha)} · ${TIPO_DOCUMENTO_LABEL[d.tipo as TipoDocumento] ?? d.tipo}`, corto(d.nombre, 70)] as [string, string])
            : [["Sin documentos", "—"]],
        },
        {
          titulo: "Rendición de gastos",
          filas: [
            ["Total provisionado", clp(totalPagado)],
            ["Total gastado", clp(totalGastos)],
            ["Devuelto al cliente", clp(devuelto)],
            ["Saldo", clp(totalPagado - totalGastos - devuelto)],
          ],
        },
      ],
      nota: "Los documentos indicados están disponibles en el expediente digital de LegalChile; puede solicitarlos a su abogado.",
      firmas: ["Abogado responsable"],
    };
  }

  // Anexo §X 12: comprobante de entrega de dinero al abogado, en dos copias (Finanzas y abogado).
  async entregaFondos(provisionId: string): Promise<Comprobante> {
    const [p] = await this.db.select().from(provisiones).where(eq(provisiones.id, provisionId));
    if (!p) throw new NotFoundException(`Provisión ${provisionId} no existe`);
    const a = await this.atencion(p.atencionId);
    if (!p.fechaEntrega || p.montoEntregado == null) throw new ConflictException("La provisión aún no se entrega al abogado");
    return {
      titulo: "Comprobante de entrega de fondos al abogado",
      numero: `${a.correlativo}-ENT-${p.id.slice(0, 8).toUpperCase()}`,
      copias: ["Finanzas", "Abogado"],
      secciones: [
        this.seccionAtencion(a),
        {
          titulo: "Entrega",
          filas: [
            ["Abogado", await this.nombreUsuario(p.solicitadaPorId)],
            ["Motivo de la provisión", p.motivo],
            ["Monto entregado", clp(p.montoEntregado)],
            ["Fecha de entrega", fecha(p.fechaEntrega)],
            ["Autorizado por", await this.nombreUsuario(p.resueltaPorId)],
          ],
        },
      ],
      nota: "El abogado rinde estos fondos con los comprobantes de gasto y devuelve el saldo no gastado.",
      firmas: ["Entregado por (Finanzas)", "Recibí conforme (Abogado)"],
    };
  }
}
