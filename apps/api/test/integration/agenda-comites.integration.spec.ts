import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import type { Permiso } from "@legalmene/shared";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones } from "../../src/db/schema/atenciones";
import { usuarios } from "../../src/db/schema/usuarios";
import { comites } from "../../src/db/schema/comites";
import { AgendaService } from "../../src/modules/agenda/agenda.service";
import { ComitesService } from "../../src/modules/comites/comites.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { ejecutarComo, type Acceso } from "../../src/common/acceso/contexto";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;
type UsuarioPrueba = Awaited<ReturnType<typeof usuarioDePrueba>>;
const como = (u: UsuarioPrueba): Acceso => ({ usuarioId: u.id, permisos: new Set(u.permisos as Permiso[]) });

// Agenda de citas (Anexo §IV, §VI, §VIII) y comité como bitácora de compromisos (§VII l.951, §VIII l.1142).
(RUN ? describe : describe.skip)("Agenda y bitácora de comités (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let agenda: AgendaService;
  let comitesSrv: ComitesService;
  const PLAN = planAleatorio("AGC");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let atencionId: string;
  let jefe: UsuarioPrueba;
  let abogado: UsuarioPrueba;
  let otroAbogado: UsuarioPrueba;
  let calendario: UsuarioPrueba;
  const avisos: { usuarioId: string; titulo: string }[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AgendaService,
        ComitesService,
        {
          provide: NotifInboxService,
          useValue: {
            crearBulk: async (items: { usuarioId: string; titulo: string }[]) => {
              avisos.push(...items);
              return [];
            },
            crearSiNoExisteUnseen: async () => ({ id: "x" }),
          },
        },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    agenda = moduleRef.get(AgendaService);
    comitesSrv = moduleRef.get(ComitesService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: PLAN });
    cm = await materiaDePrueba(db);
    jefe = await usuarioDePrueba(db, "JEFATURA_JUDICIAL");
    abogado = await usuarioDePrueba(db, "ABOGADO", { jefeId: jefe.id });
    otroAbogado = await usuarioDePrueba(db, "ABOGADO");
    calendario = await usuarioDePrueba(db, "JEFATURA_JUDICIAL");
    const [af] = await db.insert(afiliados).values({ rut: rutAleatorio(), nombres: "Agenda", apellidoPaterno: "Test" }).returning();
    afiliadoId = af.id;
    const [at] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-AGC-${PLAN.slice(-6)}`, afiliadoId, tipo: "Juicio", estado: "EnGestion", ...cm, asunto: "Agenda", abogadoAsignadoId: abogado.id, creadoPorId: abogado.id })
      .returning();
    atencionId = at.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    const ids = [jefe, abogado, otroAbogado, calendario].map((u) => u.id);
    for (const id of ids) await db.execute(sql`DELETE FROM citas WHERE responsable_id = ${id} OR creado_por_id = ${id}`);
    await db.execute(sql`DELETE FROM compromisos_comite WHERE atencion_id = ${atencionId}`);
    await db.execute(sql`DELETE FROM participantes_comite WHERE comite_id IN (SELECT id FROM comites WHERE atencion_id = ${atencionId})`);
    await db.execute(sql`DELETE FROM comites WHERE atencion_id = ${atencionId}`);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.update(usuarios).set({ jefeId: null }).where(eq(usuarios.id, abogado.id));
    for (const id of ids) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  const cita = (inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
    tipo: "Entrevista" as const,
    titulo: "Entrevista con cliente",
    inicio,
    fin,
    responsableId: abogado.id,
    ...extra,
  });

  it("agenda: crea con la atención, rechaza topes y respeta el alcance", async () => {
    const c = await ejecutarComo(como(abogado), () =>
      agenda.crear(cita("2030-03-04T13:00:00Z", "2030-03-04T14:00:00Z", { atencionId }), abogado.id),
    );
    expect(c).toMatchObject({ atencionCorrelativo: `TEST-AGC-${PLAN.slice(-6)}`, afiliadoId, estado: "Programada" });

    await expect(
      ejecutarComo(como(abogado), () => agenda.crear(cita("2030-03-04T13:30:00Z", "2030-03-04T15:00:00Z"), abogado.id)),
    ).rejects.toBeInstanceOf(ConflictException);
    // Un abogado no agenda para otro fuera de su alcance.
    await expect(
      ejecutarComo(como(otroAbogado), () => agenda.crear(cita("2030-03-05T13:00:00Z", "2030-03-05T14:00:00Z"), otroAbogado.id)),
    ).rejects.toBeInstanceOf(BadRequestException);

    const periodo = { desde: "2030-03-01", hasta: "2030-03-31" };
    expect((await ejecutarComo(como(jefe), () => agenda.listar(periodo))).map((x) => x.id)).toContain(c.id);
    expect(await ejecutarComo(como(otroAbogado), () => agenda.listar(periodo))).toEqual([]);
    await expect(ejecutarComo(como(otroAbogado), () => agenda.obtener(c.id))).rejects.toBeInstanceOf(NotFoundException);

    // Reprogramar, luego cancelar; cancelada ya no se modifica.
    const movida = await ejecutarComo(como(jefe), () => agenda.actualizar(c.id, { inicio: "2030-03-06T13:00:00Z", fin: "2030-03-06T14:00:00Z" }, jefe.id));
    expect(movida.inicio).toBe("2030-03-06T13:00:00.000Z");
    expect(avisos.some((a) => a.usuarioId === abogado.id && /reprogramada/.test(a.titulo))).toBe(true);
    await ejecutarComo(como(abogado), () => agenda.cambiarEstado(c.id, { estado: "Cancelada" }, abogado.id));
    await expect(ejecutarComo(como(abogado), () => agenda.actualizar(c.id, { titulo: "X" }, abogado.id))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("audiencias: avisan a quienes llevan el calendario y salen en el Excel", async () => {
    avisos.length = 0;
    await ejecutarComo(como(abogado), () =>
      agenda.crear(cita("2030-04-10T12:00:00Z", "2030-04-10T13:00:00Z", { tipo: "Audiencia", titulo: "Audiencia preparatoria", atencionId }), abogado.id),
    );
    const destinatarios = avisos.map((a) => a.usuarioId);
    expect(destinatarios).toEqual(expect.arrayContaining([jefe.id, calendario.id]));
    expect(destinatarios).not.toContain(abogado.id);
    const audiencias = await agenda.listar({ desde: "2030-04-01", hasta: "2030-04-30", tipo: ["Audiencia", "Comparendo"] });
    expect(audiencias.map((a) => a.titulo)).toEqual(["Audiencia preparatoria"]);
    expect((await agenda.xlsx({ desde: "2030-04-01", hasta: "2030-04-30", tipo: ["Audiencia"] })).length).toBeGreaterThan(0);
  });

  it("comité: los compromisos se registran con responsable y plazo y se validan en el comité siguiente", async () => {
    const c1 = await ejecutarComo(como(jefe), () =>
      comitesSrv.convocar(jefe.id, { atencionId, motivo: "Revisión", participantesIds: [jefe.id, abogado.id] }),
    );
    const actorAbogado = { id: abogado.id, permisos: abogado.permisos };
    const comp = await ejecutarComo(como(abogado), () =>
      comitesSrv.agregarCompromiso(c1.id, actorAbogado, { descripcion: "Presentar escrito", responsableId: abogado.id, fechaCompromiso: "2020-01-10" }),
    );
    expect(comp).toMatchObject({ estado: "Pendiente", vencido: true, responsableNombre: abogado.nombre });
    await expect(
      ejecutarComo(como(otroAbogado), () =>
        comitesSrv.agregarCompromiso(c1.id, { id: otroAbogado.id, permisos: otroAbogado.permisos }, { descripcion: "X", responsableId: otroAbogado.id, fechaCompromiso: "2030-01-01" }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    // No se valida en el mismo comité.
    await expect(comitesSrv.validarCompromiso(c1.id, comp.id, jefe.id, { estado: "Cumplido" })).rejects.toBeInstanceOf(BadRequestException);
    await comitesSrv.cerrar(c1.id, "Aprobado", "Acta 1");

    const db = drizzle(pool);
    const c2 = await comitesSrv.convocar(jefe.id, { atencionId, motivo: "Seguimiento", participantesIds: [jefe.id] });
    await db.update(comites).set({ fechaConvocatoria: new Date(Date.now() + 1000) }).where(eq(comites.id, c2.id));
    const bitacora = await comitesSrv.bitacora(c2.id);
    expect(bitacora.anterioresPorValidar.map((x) => x.id)).toEqual([comp.id]);
    await expect(comitesSrv.cerrar(c2.id, "Aprobado", "Acta 2")).rejects.toBeInstanceOf(BadRequestException);

    const validado = await comitesSrv.validarCompromiso(c2.id, comp.id, jefe.id, { estado: "Cumplido", observacion: "Presentado" });
    expect(validado).toMatchObject({ estado: "Cumplido", validadoEnComiteId: c2.id, vencido: false });
    await expect(comitesSrv.validarCompromiso(c2.id, comp.id, jefe.id, { estado: "NoCumplido" })).rejects.toBeInstanceOf(ConflictException);
    expect((await comitesSrv.bitacora(c2.id)).anterioresPorValidar[0].estado).toBe("Cumplido");
    await comitesSrv.cerrar(c2.id, "Aprobado", "Acta 2");

    await expect(
      comitesSrv.agregarCompromiso(c2.id, { id: jefe.id, permisos: jefe.permisos }, { descripcion: "Tarde", responsableId: jefe.id, fechaCompromiso: "2030-01-01" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
