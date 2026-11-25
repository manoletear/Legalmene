import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull, notInArray, or, type SQL } from "drizzle-orm";
import type {
  ActualizarCampoAdicional,
  CampoAdicional,
  CamposDeAtencion,
  CrearCampoAdicional,
  TipoAtencion,
  ValorCampoAdicional,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { camposAdicionales } from "../../db/schema/campos-adicionales";
import { atenciones } from "../../db/schema/atenciones";
import { materias, procedimientos } from "../../db/schema/maestros";
import { asegurarAtencionVisible } from "../../common/acceso/alcance";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Valida y normaliza un valor según el tipo del campo (null = vacío).
export function validarValor(c: Pick<CampoAdicional, "etiqueta" | "tipoDato" | "opciones">, v: ValorCampoAdicional): ValorCampoAdicional {
  if (v === null || (typeof v === "string" && v.trim() === "")) return null;
  switch (c.tipoDato) {
    case "Texto":
      if (typeof v !== "string") throw new BadRequestException(`${c.etiqueta}: debe ser texto`);
      return v.trim();
    case "Numero": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) throw new BadRequestException(`${c.etiqueta}: debe ser un número`);
      return n;
    }
    case "Fecha":
      if (typeof v !== "string" || !FECHA.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) {
        throw new BadRequestException(`${c.etiqueta}: debe ser una fecha (AAAA-MM-DD)`);
      }
      return v;
    case "Opcion":
      if (typeof v !== "string" || !(c.opciones ?? []).includes(v)) throw new BadRequestException(`${c.etiqueta}: opción no válida`);
      return v;
    case "SiNo":
      if (typeof v !== "boolean") throw new BadRequestException(`${c.etiqueta}: debe ser sí o no`);
      return v;
  }
}

@Injectable()
export class CamposAdicionalesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listar(soloVigentes = false): Promise<CampoAdicional[]> {
    return (await this.db
      .select()
      .from(camposAdicionales)
      .where(soloVigentes ? eq(camposAdicionales.vigente, true) : undefined)
      .orderBy(asc(camposAdicionales.orden), asc(camposAdicionales.etiqueta))) as CampoAdicional[];
  }

  async crear(input: CrearCampoAdicional): Promise<CampoAdicional> {
    if (input.materiaId) {
      const [m] = await this.db.select({ id: materias.id }).from(materias).where(eq(materias.id, input.materiaId));
      if (!m) throw new BadRequestException("La materia no existe");
    }
    if (input.procedimientoId) {
      const [p] = await this.db.select({ id: procedimientos.id }).from(procedimientos).where(eq(procedimientos.id, input.procedimientoId));
      if (!p) throw new BadRequestException("El procedimiento no existe");
    }
    const [row] = await this.db
      .insert(camposAdicionales)
      .values({
        etiqueta: input.etiqueta,
        tipoDato: input.tipoDato,
        opciones: input.tipoDato === "Opcion" ? (input.opciones ?? []) : null,
        obligatorio: input.obligatorio,
        tipoAtencion: input.tipoAtencion ?? null,
        materiaId: input.materiaId ?? null,
        procedimientoId: input.procedimientoId ?? null,
        orden: input.orden,
      })
      .returning();
    return row as CampoAdicional;
  }

  // El tipo de dato y el alcance no cambian: los valores ya registrados dependen de ellos.
  async actualizar(id: string, input: ActualizarCampoAdicional): Promise<CampoAdicional> {
    const [actual] = await this.db.select().from(camposAdicionales).where(eq(camposAdicionales.id, id));
    if (!actual) throw new NotFoundException("El campo no existe");
    if (input.opciones && actual.tipoDato !== "Opcion") throw new BadRequestException("Solo las listas de opciones tienen opciones");
    if (input.opciones && !input.opciones.length) throw new BadRequestException("Una lista de opciones necesita al menos una opción");
    const [row] = await this.db.update(camposAdicionales).set(input).where(eq(camposAdicionales.id, id)).returning();
    return row as CampoAdicional;
  }

  private aplicables(a: { tipo: TipoAtencion; materiaId: string; procedimientoId: string | null }): SQL | undefined {
    return and(
      eq(camposAdicionales.vigente, true),
      or(isNull(camposAdicionales.tipoAtencion), eq(camposAdicionales.tipoAtencion, a.tipo)),
      or(eq(camposAdicionales.materiaId, a.materiaId), a.procedimientoId ? eq(camposAdicionales.procedimientoId, a.procedimientoId) : undefined),
    );
  }

  private async atencion(id: string) {
    await asegurarAtencionVisible(this.db, id);
    const [a] = await this.db
      .select({
        tipo: atenciones.tipo,
        estado: atenciones.estado,
        materiaId: atenciones.materiaId,
        procedimientoId: atenciones.procedimientoId,
        valores: atenciones.camposAdicionales,
      })
      .from(atenciones)
      .where(eq(atenciones.id, id));
    if (!a) throw new NotFoundException("La atención no existe");
    return a;
  }

  async deAtencion(atencionId: string): Promise<CamposDeAtencion> {
    const a = await this.atencion(atencionId);
    const campos = (await this.db
      .select()
      .from(camposAdicionales)
      .where(this.aplicables(a))
      .orderBy(asc(camposAdicionales.orden), asc(camposAdicionales.etiqueta))) as CampoAdicional[];
    return { campos, valores: a.valores ?? {} };
  }

  // Guarda los valores de los campos que aplican; los obligatorios no quedan vacíos. Los valores de
  // campos que ya no aplican (materia cambiada, campo desactivado) se conservan sin tocarlos.
  async guardar(atencionId: string, valores: Record<string, ValorCampoAdicional>): Promise<CamposDeAtencion> {
    const a = await this.atencion(atencionId);
    if (["Terminada", "Abandonada", "Derivada"].includes(a.estado)) {
      throw new ConflictException(`La atención está ${a.estado.toLowerCase()}; no se puede editar`);
    }
    const { campos } = await this.deAtencion(atencionId);
    const ajenos = Object.keys(valores).filter((k) => !campos.some((c) => c.id === k));
    if (ajenos.length) throw new BadRequestException("Hay campos que no aplican a esta atención");
    const nuevos: Record<string, ValorCampoAdicional> = { ...(a.valores ?? {}) };
    for (const c of campos) {
      if (c.id in valores) nuevos[c.id] = validarValor(c, valores[c.id]);
      if (c.obligatorio && (nuevos[c.id] === null || nuevos[c.id] === undefined)) {
        throw new BadRequestException(`${c.etiqueta} es obligatorio`);
      }
    }
    // Solo si la atención sigue abierta (otra petición pudo cerrarla entretanto).
    const [ok] = await this.db
      .update(atenciones)
      .set({ camposAdicionales: nuevos, updatedAt: new Date() })
      .where(and(eq(atenciones.id, atencionId), notInArray(atenciones.estado, ["Terminada", "Abandonada", "Derivada"])))
      .returning({ id: atenciones.id });
    if (!ok) throw new ConflictException("La atención se cerró mientras se guardaba; recargue");
    return { campos, valores: nuevos };
  }
}
