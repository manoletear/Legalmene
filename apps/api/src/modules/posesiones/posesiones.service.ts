import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { Causante, CreatePosesion, Heredero, HerederoInput, PosesionEfectiva } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones, type Atencion } from "../../db/schema/atenciones";
import { herederosPosesion, posesionesEfectivas } from "../../db/schema/posesiones";
import { asegurarAtencionVisible } from "../../common/acceso/alcance";
import { formatearRut, rutValido } from "../../common/utils/rut";
import { AtencionesService, type Actor } from "../atenciones/atenciones.service";
import type { CreateAtencionDto } from "../atenciones/dto";

const ESTADOS_CERRADOS = ["Terminada", "Abandonada"];

function rutNormalizado(rut: string, quien: string): string {
  if (!rutValido(rut)) throw new BadRequestException(`RUT ${quien} inválido: ${rut}`);
  return formatearRut(rut);
}

function normalizarCausante(c: Causante): Causante {
  return { ...c, causanteRut: c.causanteRut ? rutNormalizado(c.causanteRut, "del causante") : c.causanteRut };
}

@Injectable()
export class PosesionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AtencionesService) private readonly atenciones: AtencionesService,
  ) {}

  // Crea la atención (correlativo POSE-AÑO-NNNNNN, estado Ingresada) y sus antecedentes.
  async crear(input: CreatePosesion, actor?: Actor): Promise<Atencion> {
    const { causante, ...atencion } = input;
    const datos = normalizarCausante(causante ?? {});
    const row = await this.atenciones.crear({ ...(atencion as CreateAtencionDto), tipo: "PosesionEfectiva" }, actor);
    await this.db.insert(posesionesEfectivas).values({ atencionId: row.id, ...datos });
    return row;
  }

  // Solo atenciones de tipo PosesionEfectiva visibles para el usuario.
  private async atencionPosesion(atencionId: string, editar = false) {
    await asegurarAtencionVisible(this.db, atencionId);
    const [a] = await this.db.select({ tipo: atenciones.tipo, estado: atenciones.estado }).from(atenciones).where(eq(atenciones.id, atencionId));
    if (!a || a.tipo !== "PosesionEfectiva") throw new NotFoundException(`Posesión efectiva ${atencionId} no existe`);
    if (editar && ESTADOS_CERRADOS.includes(a.estado)) {
      throw new BadRequestException("La posesión efectiva está cerrada; no se pueden modificar sus antecedentes");
    }
  }

  async obtener(atencionId: string): Promise<PosesionEfectiva> {
    await this.atencionPosesion(atencionId);
    const [pe] = await this.db.select().from(posesionesEfectivas).where(eq(posesionesEfectivas.atencionId, atencionId));
    if (!pe) throw new NotFoundException(`Posesión efectiva ${atencionId} sin antecedentes`);
    return {
      atencionId,
      causanteRut: pe.causanteRut,
      causanteNombre: pe.causanteNombre,
      causanteFechaDefuncion: pe.causanteFechaDefuncion,
      causanteUltimoDomicilio: pe.causanteUltimoDomicilio,
      causanteComuna: pe.causanteComuna,
      observaciones: pe.observaciones,
      herederos: await this.herederos(atencionId),
    };
  }

  async actualizarCausante(atencionId: string, input: Causante): Promise<PosesionEfectiva> {
    await this.atencionPosesion(atencionId, true);
    await this.db
      .update(posesionesEfectivas)
      .set({ ...normalizarCausante(input), updatedAt: new Date() })
      .where(eq(posesionesEfectivas.atencionId, atencionId));
    return this.obtener(atencionId);
  }

  private async herederos(atencionId: string): Promise<Heredero[]> {
    const rows = await this.db
      .select()
      .from(herederosPosesion)
      .where(and(eq(herederosPosesion.atencionId, atencionId), eq(herederosPosesion.vigente, true)))
      .orderBy(asc(herederosPosesion.createdAt));
    return rows.map((h) => ({
      id: h.id,
      atencionId: h.atencionId,
      rut: h.rut,
      nombre: h.nombre,
      calidad: h.calidad,
      domicilio: h.domicilio,
      email: h.email,
      telefono: h.telefono,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  async agregarHeredero(atencionId: string, input: HerederoInput): Promise<Heredero> {
    await this.atencionPosesion(atencionId, true);
    const rut = rutNormalizado(input.rut, "del heredero");
    const actuales = await this.herederos(atencionId);
    if (actuales.some((h) => h.rut === rut)) throw new BadRequestException(`El heredero ${rut} ya está registrado`);
    const [pe] = await this.db.select().from(posesionesEfectivas).where(eq(posesionesEfectivas.atencionId, atencionId));
    if (pe?.causanteRut === rut) throw new BadRequestException("El causante no puede ser heredero");
    const [h] = await this.db.insert(herederosPosesion).values({ ...input, rut, atencionId }).returning();
    return (await this.herederos(atencionId)).find((x) => x.id === h.id)!;
  }

  // Ley 19.628: el heredero se desactiva, no se borra.
  async quitarHeredero(id: string): Promise<{ id: string }> {
    const [h] = await this.db.select({ atencionId: herederosPosesion.atencionId }).from(herederosPosesion).where(eq(herederosPosesion.id, id));
    if (!h) throw new NotFoundException(`Heredero ${id} no existe`);
    await this.atencionPosesion(h.atencionId, true);
    await this.db.update(herederosPosesion).set({ vigente: false, updatedAt: new Date() }).where(eq(herederosPosesion.id, id));
    return { id };
  }
}
