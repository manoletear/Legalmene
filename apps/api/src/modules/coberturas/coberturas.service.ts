import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, SQL, sql } from "drizzle-orm";
import {
  PLANES_SIN_COBERTURA,
  type CopagoResultado,
  type CopiarCoberturasResultado,
  type CoberturaConMaestros,
  type CreateCobertura,
  type ResumenPlanCobertura,
  type TipoAtencion,
  type UpdateCobertura,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { coberturas, CoberturaRow } from "../../db/schema/aranceles";
import { competencias, materias } from "../../db/schema/maestros";
import { canales, planes } from "../../db/schema/planes";
import { planesAfiliado } from "../../db/schema/afiliados";
import { planProductoVigenteSql, planVigenteSql } from "../afiliados/vigencia";
import { atenciones } from "../../db/schema/atenciones";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { esViolacionUnica } from "../../common/utils/pg-errors";
import { ArancelesService } from "../aranceles/aranceles.service";
import { calcularCopago } from "./copago";

@Injectable()
export class CoberturasService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ArancelesService) private readonly aranceles: ArancelesService,
  ) {}

  async listar(filtro: { codPlan?: string; vigente?: boolean } = {}) {
    const condiciones: (SQL | undefined)[] = [
      filtro.codPlan ? eq(coberturas.codPlan, filtro.codPlan) : undefined,
      filtro.vigente === undefined ? undefined : eq(coberturas.vigente, filtro.vigente),
    ];
    const rows = await this.db
      .select({ cobertura: coberturas, materiaNombre: materias.nombre, competenciaNombre: competencias.nombre })
      .from(coberturas)
      .leftJoin(materias, eq(materias.id, coberturas.materiaId))
      .leftJoin(competencias, eq(competencias.id, materias.competenciaId))
      .where(and(...condiciones))
      // Reglas generales primero, luego por materia.
      .orderBy(asc(coberturas.codPlan), sql`${coberturas.materiaId} IS NOT NULL`, asc(materias.nombre), asc(coberturas.tipo));
    return rows.map((r) => ({ ...r.cobertura, materiaNombre: r.materiaNombre, competenciaNombre: r.competenciaNombre }));
  }

  // Planes vigentes (por código o canal, o los que tengan vigente un RUT) con sus RUT vigentes
  // y las reglas de cobertura vigentes. Los planes no vigentes no aparecen.
  async resumenPlanes(filtro: { codPlan?: string; canalId?: string; afiliadoId?: string }): Promise<ResumenPlanCobertura[]> {
    const condiciones: (SQL | undefined)[] = [
      planProductoVigenteSql,
      filtro.codPlan ? eq(planes.codPlan, filtro.codPlan) : undefined,
      filtro.canalId ? eq(planes.canalId, filtro.canalId) : undefined,
      filtro.afiliadoId
        ? sql`exists (select 1 from ${planesAfiliado} where ${planesAfiliado.codPlan} = ${planes.codPlan}
            and ${planesAfiliado.afiliadoId} = ${filtro.afiliadoId} and ${planVigenteSql})`
        : undefined,
    ];
    const filas = await this.db
      .select({
        codPlan: planes.codPlan,
        nombre: planes.nombre,
        canalId: planes.canalId,
        canalNombre: canales.nombre,
        rutsVigentes: sql<number>`(select count(distinct ${planesAfiliado.afiliadoId})::int from ${planesAfiliado}
          where ${planesAfiliado.codPlan} = ${planes.codPlan} and ${planVigenteSql})`,
      })
      .from(planes)
      .leftJoin(canales, eq(canales.id, planes.canalId))
      .where(and(...condiciones))
      .orderBy(asc(planes.codPlan))
      .limit(200);
    if (!filas.length) return [];
    const reglas = (await this.listar({ vigente: true })) as CoberturaConMaestros[];
    const porPlan = new Map<string, CoberturaConMaestros[]>();
    for (const r of reglas) porPlan.set(r.codPlan, [...(porPlan.get(r.codPlan) ?? []), r]);
    return filas.map((f) => ({ ...f, rutsVigentes: Number(f.rutsVigentes), coberturas: porPlan.get(f.codPlan) ?? [] }));
  }

  async crear(input: CreateCobertura): Promise<CoberturaRow> {
    const [plan] = await this.db.select({ c: planes.codPlan }).from(planes).where(eq(planes.codPlan, input.codPlan));
    if (!plan) throw new BadRequestException(`Plan ${input.codPlan} no existe`);
    if (input.materiaId) await this.assertMateria(input.materiaId);
    try {
      const [row] = await this.db.insert(coberturas).values(this.normalizar(input)).returning();
      return row;
    } catch (err) {
      throw this.traducir(err);
    }
  }

  // Copia las reglas vigentes de `desde` al plan `codPlan` (Anexo §I l.79). Con `reemplazar`, una
  // regla existente para la misma materia y tipo toma los valores del origen (y queda vigente);
  // sin él se conserva. Las reglas del destino que el origen no tiene no se tocan.
  async copiar(codPlan: string, desde: string, reemplazar: boolean): Promise<CopiarCoberturasResultado> {
    if (codPlan === desde) throw new BadRequestException("El plan de origen y el de destino son el mismo");
    if ((PLANES_SIN_COBERTURA as readonly string[]).includes(codPlan)) {
      throw new BadRequestException(`El plan ${codPlan} es sin cobertura y no lleva reglas`);
    }
    const existentes = await this.db.select({ c: planes.codPlan }).from(planes).where(inArray(planes.codPlan, [codPlan, desde]));
    if (!existentes.some((p) => p.c === codPlan)) throw new NotFoundException(`Plan ${codPlan} no existe`);
    if (!existentes.some((p) => p.c === desde)) throw new BadRequestException(`Plan ${desde} no existe`);

    return this.db.transaction(async (tx) => {
      const origen = await tx
        .select()
        .from(coberturas)
        .where(and(eq(coberturas.codPlan, desde), eq(coberturas.vigente, true)));
      if (!origen.length) return { copiadas: 0, omitidas: 0 };
      const valores = origen.map((c) => ({
        codPlan,
        materiaId: c.materiaId,
        tipo: c.tipo,
        modalidad: c.modalidad,
        porcentaje: c.porcentaje,
        valorUfCentesimas: c.valorUfCentesimas,
        vigente: true,
      }));
      const insert = tx.insert(coberturas).values(valores);
      const filas = reemplazar
        ? await insert
            .onConflictDoUpdate({
              target: [coberturas.codPlan, coberturas.materiaId, coberturas.tipo],
              set: {
                modalidad: sql`excluded.modalidad`,
                porcentaje: sql`excluded.porcentaje`,
                valorUfCentesimas: sql`excluded.valor_uf_centesimas`,
                vigente: true,
                updatedAt: new Date(),
              },
            })
            .returning({ id: coberturas.id })
        : await insert.onConflictDoNothing().returning({ id: coberturas.id });
      return { copiadas: filas.length, omitidas: origen.length - filas.length };
    });
  }

  async actualizar(id: string, patch: UpdateCobertura): Promise<CoberturaRow> {
    const [actual] = await this.db.select().from(coberturas).where(eq(coberturas.id, id));
    if (!actual) throw new NotFoundException(`Cobertura ${id} no existe`);
    const merged = this.normalizar({ ...actual, ...patch });
    if (merged.modalidad === "Porcentaje" && merged.porcentaje === null) {
      throw new BadRequestException("Porcentaje requerido");
    }
    if (merged.modalidad === "ValorUF" && merged.valorUfCentesimas === null) {
      throw new BadRequestException("Valor UF requerido");
    }
    const [row] = await this.db
      .update(coberturas)
      .set({ ...merged, vigente: patch.vigente ?? actual.vigente, updatedAt: new Date() })
      .where(eq(coberturas.id, id))
      .returning();
    return row;
  }

  async copago(codPlan: string, materiaId: string, tipo: TipoAtencion): Promise<CopagoResultado> {
    const [arancel, reglas, uf] = await Promise.all([
      this.aranceles.aplicable(materiaId, tipo),
      this.db
        .select()
        .from(coberturas)
        .where(and(eq(coberturas.codPlan, codPlan), eq(coberturas.vigente, true))),
      this.aranceles.ufVigente(),
    ]);
    return calcularCopago({ arancel, coberturas: reglas, materiaId, tipo, ufCentavos: uf?.valorCentavos ?? null });
  }

  async copagoAtencion(atencionId: string): Promise<CopagoResultado & { codPlan: string }> {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan, materiaId: atenciones.materiaId, tipo: atenciones.tipo })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return { codPlan: a.codPlan, ...(await this.copago(a.codPlan, a.materiaId, a.tipo)) };
  }

  // Solo se guarda el valor que corresponde a la modalidad.
  private normalizar(c: {
    codPlan: string;
    materiaId?: string | null;
    tipo?: TipoAtencion | null;
    modalidad: CoberturaRow["modalidad"];
    porcentaje?: number | null;
    valorUfCentesimas?: number | null;
  }) {
    return {
      codPlan: c.codPlan,
      materiaId: c.materiaId ?? null,
      tipo: c.tipo ?? null,
      modalidad: c.modalidad,
      porcentaje: c.modalidad === "Porcentaje" ? (c.porcentaje ?? null) : null,
      valorUfCentesimas: c.modalidad === "ValorUF" ? (c.valorUfCentesimas ?? null) : null,
    };
  }

  private async assertMateria(materiaId: string) {
    const [m] = await this.db.select({ id: materias.id }).from(materias).where(eq(materias.id, materiaId));
    if (!m) throw new BadRequestException(`Materia ${materiaId} no existe`);
  }

  private traducir(err: unknown): unknown {
    if (esViolacionUnica(err)) {
      return new ConflictException("El plan ya tiene una regla de cobertura para esa materia y tipo de atención");
    }
    return err;
  }
}
