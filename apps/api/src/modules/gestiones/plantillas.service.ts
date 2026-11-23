import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { CreateGestionPlantilla, UpdateGestionPlantilla } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { gestiones, gestionesPlantilla, GestionPlantillaRow } from "../../db/schema/gestiones";
import { finDeDiaChile, hoyChileISO, sumarDiasHabiles } from "../../common/utils/dias-habiles";

export interface FiltroPlantillas {
  materiaId?: string;
  procedimientoId?: string;
  vigente?: boolean;
}

@Injectable()
export class PlantillasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  listar(f: FiltroPlantillas = {}): Promise<GestionPlantillaRow[]> {
    return this.db
      .select()
      .from(gestionesPlantilla)
      .where(
        and(
          f.materiaId ? eq(gestionesPlantilla.materiaId, f.materiaId) : undefined,
          f.procedimientoId ? eq(gestionesPlantilla.procedimientoId, f.procedimientoId) : undefined,
          f.vigente === undefined ? undefined : eq(gestionesPlantilla.vigente, f.vigente),
        ),
      )
      .orderBy(asc(gestionesPlantilla.orden), asc(gestionesPlantilla.titulo));
  }

  async crear(input: CreateGestionPlantilla): Promise<GestionPlantillaRow> {
    const [row] = await this.db
      .insert(gestionesPlantilla)
      .values({ ...input, materiaId: input.materiaId ?? null, procedimientoId: input.procedimientoId ?? null })
      .returning();
    return row;
  }

  async actualizar(id: string, patch: UpdateGestionPlantilla): Promise<GestionPlantillaRow> {
    const [actual] = await this.db.select().from(gestionesPlantilla).where(eq(gestionesPlantilla.id, id));
    if (!actual) throw new NotFoundException(`Plantilla ${id} no existe`);
    const materiaId = patch.materiaId === undefined ? actual.materiaId : patch.materiaId;
    const procedimientoId = patch.procedimientoId === undefined ? actual.procedimientoId : patch.procedimientoId;
    if (!materiaId && !procedimientoId) throw new BadRequestException("Indique materia o procedimiento");
    const [row] = await this.db
      .update(gestionesPlantilla)
      .set(patch)
      .where(eq(gestionesPlantilla.id, id))
      .returning();
    return row;
  }

  // Crea como gestiones Pendientes las plantillas vigentes de la materia y del procedimiento
  // que aún no existen en la atención. Plazo = hoy + N días hábiles (Anexo §XIV).
  async instanciar(input: {
    atencionId: string;
    materiaId: string | null;
    procedimientoId: string | null;
    responsableId: string;
    hoy?: string;
  }): Promise<number> {
    const filtros = [
      input.materiaId ? eq(gestionesPlantilla.materiaId, input.materiaId) : undefined,
      input.procedimientoId ? eq(gestionesPlantilla.procedimientoId, input.procedimientoId) : undefined,
    ].filter(Boolean);
    if (filtros.length === 0) return 0;

    const plantillas = await this.db
      .select()
      .from(gestionesPlantilla)
      .where(and(eq(gestionesPlantilla.vigente, true), or(...filtros)))
      .orderBy(asc(gestionesPlantilla.orden));
    if (plantillas.length === 0) return 0;

    const existentes = await this.db
      .select({ plantillaId: gestiones.plantillaId })
      .from(gestiones)
      .where(
        and(
          eq(gestiones.atencionId, input.atencionId),
          inArray(
            gestiones.plantillaId,
            plantillas.map((p) => p.id),
          ),
        ),
      );
    const ya = new Set(existentes.map((e) => e.plantillaId));
    const hoy = input.hoy ?? hoyChileISO();
    const nuevas = plantillas
      .filter((p) => !ya.has(p.id))
      .map((p) => ({
        atencionId: input.atencionId,
        plantillaId: p.id,
        tipo: p.tipo,
        titulo: p.titulo,
        estado: "Pendiente" as const,
        responsableId: input.responsableId,
        fechaCompromiso: finDeDiaChile(sumarDiasHabiles(hoy, p.plazoDiasHabiles)),
      }));
    if (nuevas.length === 0) return 0;
    await this.db.insert(gestiones).values(nuevas).onConflictDoNothing();
    return nuevas.length;
  }
}
