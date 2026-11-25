import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { aranceles, coberturas, valoresUf } from "../../src/db/schema/aranceles";
import { causasTermino } from "../../src/db/schema/maestros";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { ComprobantesPdfService, dibujarComprobante } from "../../src/modules/exports/comprobantes-pdf.service";
import { PassThrough } from "stream";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { CorreosService } from "../../src/modules/correos/correos.service";
import { PagosService } from "../../src/modules/pagos/pagos.service";
import { afiliados } from "../../src/db/schema/afiliados";
import { eq } from "drizzle-orm";
import { hoyChileISO } from "../../src/common/utils/dias-habiles";
import {
  borrarAtencionesDePlan,
  borrarMateriaDePrueba,
  materiaDePrueba,
  planAleatorio,
  rutAleatorio,
  usuarioDePrueba,
  comprobanteDePrueba,
  type MateriaPrueba,
} from "./helpers";

const RUN = !!process.env.DATABASE_URL;
// Fecha antigua y propia del spec para no chocar con la UF real del seed.
const FECHA_PAGO = "2001-03-15";

(RUN ? describe : describe.skip)("Arancel por atención — Anexo §IX (integration)", () => {
  let moduleRef: TestingModule;
  let atencionesSrv: AtencionesService;
  let arancelSrv: ArancelesAtencionService;
  let provisionesSrv: ProvisionesService;
  let pool: Pool;
  const PLAN = planAleatorio("TA");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let abogado: { id: string; permisos: readonly string[] };
  let jefe: { id: string; permisos: readonly string[] };
  let causaId: string;

  const avisos: { usuarioId: string; titulo: string }[] = [];
  const correos: { para: string[]; asunto: string; texto: string }[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        PlantillasService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        ProvisionesService,
        GestionesService,
        ComprobantesPdfService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        PagosService,
        {
          provide: CorreosService,
          useValue: {
            url: (r: string) => `http://web.test${r}`,
            enviar: async (para: string[], c: { asunto: string; texto: string }) => {
              correos.push({ para, asunto: c.asunto, texto: c.texto });
              return "Omitido";
            },
            aUsuarios: async () => undefined,
          },
        },
        {
          provide: NotifInboxService,
          useValue: {
            crear: async () => null,
            crearSiNoExisteUnseen: async () => null,
            crearBulk: async (items: { usuarioId: string; titulo: string }[]) => {
              avisos.push(...items);
              return [];
            },
          },
        },
      ],
    }).compile();
    atencionesSrv = moduleRef.get(AtencionesService);
    arancelSrv = moduleRef.get(ArancelesAtencionService);
    provisionesSrv = moduleRef.get(ProvisionesService);
    pool = moduleRef.get(PG_POOL);
    const afiliadosSrv = moduleRef.get(AfiliadosService);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    // Arancel de 10 UF con 40% de cobertura: copago 6 UF.
    await db.insert(aranceles).values({ materiaId: cm.materiaId, codigo: `A-${PLAN}`, descripcion: "Test", valorUfCentesimas: 1000 });
    await db.insert(coberturas).values({ codPlan: PLAN, modalidad: "Porcentaje", porcentaje: 40 });
    await db.insert(valoresUf).values({ fecha: FECHA_PAGO, valorCentavos: 1_600_000 }).onConflictDoNothing();
    const afi = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Arancel" });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: PLAN, fechaInicio: "2024-01-01" });
    const uj = await usuarioDePrueba(db, "GERENCIA_SERVICIOS");
    const ua = await usuarioDePrueba(db, "ABOGADO", { jefeId: uj.id });
    abogado = { id: ua.id, permisos: ua.permisos };
    jefe = { id: uj.id, permisos: uj.permisos };
    const [c] = await db.insert(causasTermino).values({ nombre: `Causa ${PLAN}` }).returning();
    causaId = c.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM pagos WHERE cod_plan = ${PLAN}`);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM coberturas WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM causas_termino WHERE id = ${causaId}`);
    await db.execute(sql`DELETE FROM usuarios WHERE id IN (${abogado.id}, ${jefe.id})`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  const nuevaAsesoria = () =>
    atencionesSrv.crear({ codPlan: PLAN, afiliadoId, ...cm, asunto: "Arancel", tipo: "Asesoria" }, abogado);

  it("ciclo rojo → naranjo → amarillo → verde con la UF del día del pago", async () => {
    const a = await nuevaAsesoria();
    const ar = await arancelSrv.obtener(a.id);
    expect(ar?.estado).toBe("Requerido");
    expect(ar?.copagoUfCentesimas).toBe(600);
    expect(ar?.coberturaPorcentaje).toBe(40);

    const comprobantes = moduleRef.get(ComprobantesPdfService);
    await expect(comprobantes.reciboArancel(a.id)).rejects.toBeInstanceOf(ConflictException); // aún sin pago

    // Detenida: solo gestiones de contacto con el cliente mientras el arancel esté impago.
    const gestionesSrv = moduleRef.get(GestionesService);
    const nueva = (tipo: "EscritoJudicial" | "LlamadaTelefonica") =>
      gestionesSrv.crear({ atencionId: a.id, tipo, titulo: tipo, responsableId: abogado.id, documentosIds: [] });
    await expect(nueva("EscritoJudicial")).rejects.toThrow(/detenida hasta el pago del arancel/);
    const llamada = await nueva("LlamadaTelefonica");
    await gestionesSrv.completar(llamada.id, { resultado: "Se informa el copago" });

    // Detenida: no pasa a Pendiente con el arancel impago, pero sí a "espera de arancel".
    await expect(atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).rejects.toThrow(/pago del arancel/);
    expect((await atencionesSrv.cambiarEstado(a.id, { estado: "EnEsperaArancel" })).estado).toBe("EnEsperaArancel");

    avisos.length = 0;
    await arancelSrv.enviarAprobacion(a.id, abogado.id);
    // La jefatura del abogado recibe el aviso para aprobar.
    expect(avisos.find((x) => /Arancel por aprobar/.test(x.titulo))?.usuarioId).toBe(jefe.id);
    const rech = await arancelSrv.rechazar(a.id, jefe.id, "Monto mal informado");
    expect(avisos.find((x) => /Arancel rechazado/.test(x.titulo))?.usuarioId).toBe(abogado.id);
    expect(rech.estado).toBe("Requerido");
    expect(rech.motivoRechazo).toBe("Monto mal informado");

    await arancelSrv.enviarAprobacion(a.id, abogado.id);
    await expect(arancelSrv.registrarPago(a.id, jefe.id, { medio: "CasaCentral", fechaPago: FECHA_PAGO })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await arancelSrv.aprobar(a.id, jefe.id);
    await expect(arancelSrv.registrarPago(a.id, jefe.id, { medio: "CasaCentral", fechaPago: "2001-03-16" })).rejects.toThrow(
      /No hay valor UF cargado para el 16\/03\/2001/,
    );
    const pagado = await arancelSrv.registrarPago(a.id, jefe.id, { medio: "CasaCentral", fechaPago: FECHA_PAGO });
    expect(pagado.estado).toBe("Pagado");
    expect(pagado.montoClp).toBe(96_000); // 6 UF × $16.000
    expect(pagado.ufValorCentavos).toBe(1_600_000);
    // El pago se avisa al abogado (no a quien lo registró).
    expect(avisos.filter((x) => /Arancel pagado/.test(x.titulo)).map((x) => x.usuarioId)).toEqual([abogado.id]);

    // Anexo §IX 5.4: comprobante en dos copias con el monto en pesos y la forma de pago.
    const recibo = await comprobantes.reciboArancel(a.id);
    expect(recibo.copias).toEqual(["Administración", "Cliente"]);
    const pago = recibo.secciones.find((s) => s.titulo === "Pago")!.filas;
    expect(pago).toEqual(expect.arrayContaining([["Monto pagado", "$ 96.000"], ["Forma de pago", "Pago en casa central"], ["Copago", "6,00 UF"]]));
    const pdf = await new Promise<Buffer>((resolve) => {
      const out = new PassThrough();
      const partes: Buffer[] = [];
      out.on("data", (c: Buffer) => partes.push(c));
      out.on("end", () => resolve(Buffer.concat(partes)));
      dibujarComprobante(recibo, out);
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(2);

    expect((await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).estado).toBe("Pendiente");
    expect((await nueva("EscritoJudicial")).estado).toBe("Pendiente");

    // Informe final al cliente: resultado, gestiones completadas y rendición de gastos.
    const informe = await comprobantes.informeFinal(a.id);
    expect(informe.copias).toEqual(["Cliente"]);
    expect(informe.secciones.map((x) => x.titulo)).toEqual(["Cliente y atención", "Resultado", "Gestiones realizadas", "Documentos del caso", "Rendición de gastos"]);
    expect(informe.secciones[2].filas[0][1]).toBe("Se informa el copago");
    const eventos = await arancelSrv.eventos(a.id);
    expect(eventos.map((e) => e.estadoHasta)).toEqual(["Requerido", "EnAprobacion", "Rechazado", "EnAprobacion", "Aprobado", "Pagado"]);
  });

  it("Notificar Pago: orden WebPay al cliente; el pago la deja Pagada sola, también desde En aprobación", async () => {
    const db = drizzle(pool);
    const hoy = hoyChileISO();
    await db.insert(valoresUf).values({ fecha: hoy, valorCentavos: 1_600_000 }).onConflictDoNothing();
    const [uf] = await db.select().from(valoresUf).where(eq(valoresUf.fecha, hoy));
    const a = await nuevaAsesoria();
    await expect(arancelSrv.notificarPago(a.id, abogado.id)).rejects.toThrow(/no tiene correo/);
    await db.update(afiliados).set({ email: "cliente.arancel@example.com" }).where(eq(afiliados.id, afiliadoId));

    // Primero se envía a la jefatura y luego se cambia a WebPay: el camino es modificable.
    await arancelSrv.enviarAprobacion(a.id, abogado.id);
    expect((await arancelSrv.obtener(a.id))?.caminoPago).toBe("Aprobacion");
    correos.length = 0;
    const n = await arancelSrv.notificarPago(a.id, abogado.id);
    const esperado = Math.round((600 * uf.valorCentavos) / 10_000);
    expect(n.montoClp).toBe(esperado);
    expect(correos[0].para).toEqual(["cliente.arancel@example.com"]);
    expect(correos[0].texto).toContain(`ordenCompra=${n.ordenCompra}`);
    const ar = await arancelSrv.obtener(a.id);
    expect(ar).toMatchObject({ estado: "EnAprobacion", caminoPago: "WebPay", webpayOrdenCompra: n.ordenCompra });

    // Una nueva notificación deja sin efecto la orden anterior: pagarla no marca el arancel.
    const n2 = await arancelSrv.notificarPago(a.id, abogado.id);
    avisos.length = 0;
    await moduleRef.get(PagosService).confirmar(n.ordenCompra, "AUTH0", true);
    expect((await arancelSrv.obtener(a.id))?.estado).toBe("EnAprobacion");
    expect(avisos.some((x) => /no corresponde a la orden vigente/.test(x.titulo))).toBe(true);
    avisos.length = 0;
    await moduleRef.get(PagosService).confirmar(n2.ordenCompra, "AUTH1", true);
    const pagado = await arancelSrv.obtener(a.id);
    expect(pagado).toMatchObject({ estado: "Pagado", medioPago: "WebPay", montoClp: esperado, referenciaPago: n2.ordenCompra, fechaPago: hoy });
    // Aviso al abogado y a su jefatura (Anexo §IX 4.1).
    expect(avisos.filter((x) => /Arancel pagado/.test(x.titulo)).map((x) => x.usuarioId).sort()).toEqual([abogado.id, jefe.id].sort());
    // Pagado: ya no se notifica ni se cambia el camino.
    await expect(arancelSrv.notificarPago(a.id, abogado.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await arancelSrv.eventos(a.id)).map((e) => e.estadoHasta)).toEqual(["Requerido", "EnAprobacion", "EnAprobacion", "EnAprobacion", "Pagado"]);
  });

  it("sin copago el arancel queda NoRequerido y no detiene la atención", async () => {
    const db = drizzle(pool);
    await db.execute(sql`UPDATE coberturas SET porcentaje = 100 WHERE cod_plan = ${PLAN}`);
    try {
      const a = await nuevaAsesoria();
      expect((await arancelSrv.obtener(a.id))?.estado).toBe("NoRequerido");
      expect((await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).estado).toBe("Pendiente");
    } finally {
      await db.execute(sql`UPDATE coberturas SET porcentaje = 40 WHERE cod_plan = ${PLAN}`);
    }
  });

  it("no se termina con provisiones sin rendir; al terminar, las rendidas se cierran", async () => {
    const db = drizzle(pool);
    await db.execute(sql`UPDATE coberturas SET porcentaje = 100 WHERE cod_plan = ${PLAN}`);
    try {
      const a = await nuevaAsesoria();
      await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" });
      const p = await provisionesSrv.solicitar(a.id, abogado.id, { monto: 10_000, motivo: "Gasto" });
      await expect(atencionesSrv.solicitarTermino(a.id, { causaTerminoId: causaId }, abogado)).rejects.toThrow(
        /provisión\(es\) de fondos sin rendir/,
      );
      await provisionesSrv.registrarPagoCliente(p.id, jefe.id, "Transferencia");
      await provisionesSrv.solicitarEntrega(p.id, abogado.id);
      await provisionesSrv.autorizar(p.id, jefe.id);
      await provisionesSrv.marcarDisponible(p.id, jefe.id);
      await pool.query("UPDATE provisiones SET fecha_resolucion = now() - interval '10 days' WHERE id = $1", [p.id]);
      await provisionesSrv.entregar(p.id, jefe.id);
      const comprobante = await comprobanteDePrueba(drizzle(pool), a.id, abogado.id);
      await provisionesSrv.registrarMovimiento(p.id, abogado.id, { tipo: "Gasto", monto: 10_000, glosa: "Receptor", documentoId: comprobante });
      await provisionesSrv.rendir(p.id, abogado.id);
      await atencionesSrv.solicitarTermino(a.id, { causaTerminoId: causaId }, abogado);
      const t = await atencionesSrv.aprobarTermino(a.id, jefe);
      expect(t.estado).toBe("Terminada");
      const { data } = await provisionesSrv.listarPorAtencion(a.id);
      expect(data[0].estado).toBe("Cerrada");
    } finally {
      await db.execute(sql`UPDATE coberturas SET porcentaje = 40 WHERE cod_plan = ${PLAN}`);
    }
  });

  it("sin cobertura del plan: espera la autorización de Gerencia de Servicios; rechazada, solo se abandona", async () => {
    const db = drizzle(pool);
    const coberturasSrv = moduleRef.get(CoberturasService);
    const regla = await coberturasSrv.crear({ codPlan: PLAN, materiaId: cm.materiaId, modalidad: "SinCobertura" });
    try {
      const a = await nuevaAsesoria();
      expect(a.autorizacionCobertura).toBeFalsy(); // la fila devuelta es previa a la sincronización
      const leida = await atencionesSrv.obtener(a.id);
      expect(leida.autorizacionCobertura?.estado).toBe("Pendiente");
      await expect(atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).rejects.toThrow(/Gerencia de Servicios/);

      const ok = await atencionesSrv.resolverCobertura(a.id, true, "Excepción comercial", jefe);
      expect(ok.autorizacionCobertura).toMatchObject({ estado: "Autorizada", resueltaPorId: jefe.id, observacion: "Excepción comercial" });
      await expect(atencionesSrv.resolverCobertura(a.id, false, "x", jefe)).rejects.toBeInstanceOf(ConflictException);
      // Autorizada, sigue el flujo normal: solo falta el arancel (completo, sin cobertura).
      const err = await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" }).catch((e: Error) => e);
      expect((err as Error).message).toMatch(/pago del arancel/);
      expect((err as Error).message).not.toMatch(/Gerencia de Servicios/);

      const b = await nuevaAsesoria();
      const rech = await atencionesSrv.resolverCobertura(b.id, false, "Fuera de política", jefe);
      expect(rech.autorizacionCobertura?.estado).toBe("Rechazada");
      await expect(atencionesSrv.cambiarEstado(b.id, { estado: "Pendiente" })).rejects.toThrow(/corresponde abandonar/);
      expect((await atencionesSrv.cambiarEstado(b.id, { estado: "Abandonada", causaTerminoId: causaId })).estado).toBe("Abandonada");
    } finally {
      await db.execute(sql`DELETE FROM coberturas WHERE id = ${regla.id}`);
    }
  });
});
