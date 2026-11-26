import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { gestiones } from "../../db/schema/gestiones";
import { competencias, materias } from "../../db/schema/maestros";
import { usuarios } from "../../db/schema/usuarios";
import { busquedaIndexado } from "../../db/schema/busqueda";
import {
  ENTIDADES_BUSQUEDA,
  MAPEOS,
  consulta,
  documentoAfiliado,
  documentoAtencion,
  type EntidadBusqueda,
} from "./documentos";

const LOTE = 500;

export interface EstadoBusqueda {
  habilitado: boolean;
  disponible: boolean;
  indices: { entidad: EntidadBusqueda; documentos: number | null; indexadoHasta: string | null }[];
}

// Búsqueda de texto completo con OpenSearch (opcional). Sin OPENSEARCH_URL, o si OpenSearch no
// responde, buscarIds() devuelve null y los servicios usan la búsqueda de Postgres (tsvector).
// La sincronización es incremental: cada minuto indexa lo modificado desde la última marca.
@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name);
  private readonly cliente: Client | null;
  private readonly prefijo: string;
  private indicesListos = false;
  private sincronizando = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ConfigService) config: ConfigService,
  ) {
    const url = config.get<string>("OPENSEARCH_URL");
    this.prefijo = config.get<string>("OPENSEARCH_INDEX_PREFIX") ?? "nexus";
    if (!url) {
      this.cliente = null;
      return;
    }
    // En AWS se firma con las credenciales del rol de la tarea (SigV4); en local, URL directa.
    const region = config.get<string>("OPENSEARCH_AWS_REGION");
    this.cliente = new Client({
      node: url,
      requestTimeout: 5000,
      ...(region ? AwsSigv4Signer({ region, service: "es", getCredentials: defaultProvider() }) : {}),
    });
  }

  get habilitado(): boolean {
    return this.cliente !== null;
  }

  private indice(e: EntidadBusqueda) {
    return `${this.prefijo}-${e}`;
  }

  async onModuleInit() {
    if (this.cliente) await this.asegurarIndices().catch((e) => this.logger.warn(`OpenSearch no disponible al iniciar: ${e}`));
  }

  private async asegurarIndices() {
    if (!this.cliente || this.indicesListos) return;
    for (const e of ENTIDADES_BUSQUEDA) {
      const existe = await this.cliente.indices.exists({ index: this.indice(e) });
      if (!existe.body) await this.cliente.indices.create({ index: this.indice(e), body: MAPEOS[e] as never });
    }
    this.indicesListos = true;
  }

  // Ids que coinciden con el texto, ordenados por relevancia. null = usar la búsqueda de Postgres.
  async buscarIds(entidad: EntidadBusqueda, q: string): Promise<string[] | null> {
    if (!this.cliente || !q.trim()) return null;
    try {
      await this.asegurarIndices();
      const r = await this.cliente.search({ index: this.indice(entidad), body: consulta(entidad, q) as never });
      return (r.body.hits.hits as { _id: string }[]).map((h) => h._id);
    } catch (e) {
      this.logger.warn(`OpenSearch falló; se usa la búsqueda de la base: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  // ---- indexación

  private async filasAtenciones(ids: string[]) {
    if (!ids.length) return [];
    const filas = await this.db
      .select({
        id: atenciones.id,
        correlativo: atenciones.correlativo,
        tipo: atenciones.tipo,
        estado: atenciones.estado,
        asunto: atenciones.asunto,
        descripcion: atenciones.descripcion,
        respuesta: atenciones.respuesta,
        materia: materias.nombre,
        competencia: competencias.nombre,
        afiliado: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno} || coalesce(' ' || ${afiliados.apellidoMaterno}, '')`,
        rut: afiliados.rut,
        abogado: usuarios.nombre,
        fechaApertura: atenciones.fechaApertura,
        gestiones: sql<string | null>`(select string_agg(coalesce(g.titulo, '') || ' ' || coalesce(g.resultado, ''), ' ') from gestiones g where g.atencion_id = ${atenciones.id})`,
      })
      .from(atenciones)
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .leftJoin(materias, eq(materias.id, atenciones.materiaId))
      .leftJoin(competencias, eq(competencias.id, atenciones.competenciaId))
      .leftJoin(usuarios, eq(usuarios.id, atenciones.abogadoAsignadoId))
      .where(inArray(atenciones.id, ids));
    return filas.map((f) => ({ id: f.id, doc: documentoAtencion(f) }));
  }

  private async filasAfiliados(ids: string[]) {
    if (!ids.length) return [];
    const filas = await this.db
      .select({
        id: afiliados.id,
        rut: afiliados.rut,
        nombre: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno} || coalesce(' ' || ${afiliados.apellidoMaterno}, '')`,
        email: afiliados.email,
        telefono: afiliados.telefono,
        comuna: afiliados.comuna,
      })
      .from(afiliados)
      .where(inArray(afiliados.id, ids));
    return filas.map((f) => ({ id: f.id, doc: documentoAfiliado(f) }));
  }

  private async escribir(entidad: EntidadBusqueda, docs: { id: string; doc: Record<string, unknown> }[]) {
    if (!this.cliente || !docs.length) return;
    const body = docs.flatMap((d) => [{ index: { _index: this.indice(entidad), _id: d.id } }, d.doc]);
    const r = await this.cliente.bulk({ body: body as never, refresh: false });
    if (r.body.errors) throw new Error(`OpenSearch rechazó documentos de ${entidad}`);
  }

  private async marca(entidad: EntidadBusqueda): Promise<Date> {
    const [m] = await this.db.select().from(busquedaIndexado).where(eq(busquedaIndexado.entidad, entidad));
    return m?.indexadoHasta ?? new Date(0);
  }

  private async fijarMarca(entidad: EntidadBusqueda, hasta: Date) {
    await this.db
      .insert(busquedaIndexado)
      .values({ entidad, indexadoHasta: hasta })
      .onConflictDoUpdate({ target: busquedaIndexado.entidad, set: { indexadoHasta: hasta, updatedAt: new Date() } });
  }

  // Un lote por entidad: lo modificado después de la marca (en atenciones, también si cambió una gestión).
  private async lote(entidad: EntidadBusqueda): Promise<number> {
    const desde = await this.marca(entidad);
    if (entidad === "afiliados") {
      const cambios = await this.db
        .select({ id: afiliados.id, t: afiliados.updatedAt })
        .from(afiliados)
        .where(gt(afiliados.updatedAt, desde))
        .orderBy(asc(afiliados.updatedAt))
        .limit(LOTE);
      if (!cambios.length) return 0;
      await this.escribir("afiliados", await this.filasAfiliados(cambios.map((c) => c.id)));
      await this.fijarMarca("afiliados", cambios[cambios.length - 1].t);
      return cambios.length;
    }
    const cambios = await this.db
      .select({ id: atenciones.id, t: atenciones.updatedAt })
      .from(atenciones)
      .where(gt(atenciones.updatedAt, desde))
      .orderBy(asc(atenciones.updatedAt))
      .limit(LOTE);
    const hasta = cambios.length ? cambios[cambios.length - 1].t : new Date();
    const porGestion = await this.db
      .selectDistinct({ id: gestiones.atencionId })
      .from(gestiones)
      .where(and(gt(gestiones.updatedAt, desde), sql`${gestiones.updatedAt} <= ${hasta}`))
      .limit(LOTE);
    const ids = [...new Set([...cambios.map((c) => c.id), ...porGestion.map((g) => g.id)])];
    if (!ids.length) return 0;
    await this.escribir("atenciones", await this.filasAtenciones(ids));
    if (cambios.length) await this.fijarMarca("atenciones", hasta);
    return cambios.length;
  }

  // Indexa de inmediato lo recién creado o editado (sin esperar al proceso de cada minuto, que
  // igual lo recoge si esto falla). No bloquea ni propaga errores al usuario.
  indexarPronto(entidad: EntidadBusqueda, ids: string[]): void {
    if (!this.cliente || !ids.length) return;
    void (async () => {
      await this.asegurarIndices();
      const docs = entidad === "atenciones" ? await this.filasAtenciones(ids) : await this.filasAfiliados(ids);
      await this.escribir(entidad, docs);
    })().catch((e) => this.logger.warn(`Indexación inmediata pendiente (${entidad}): ${e instanceof Error ? e.message : e}`));
  }

  // Cada minuto. Frecuente como el despachador de webhooks: no se audita cada corrida.
  @Cron("0 * * * * *")
  async sincronizar(): Promise<number> {
    if (!this.cliente || this.sincronizando) return 0;
    this.sincronizando = true;
    let total = 0;
    try {
      await this.asegurarIndices();
      for (const e of ENTIDADES_BUSQUEDA) {
        let n: number;
        do {
          n = await this.lote(e);
          total += n;
        } while (n === LOTE);
      }
    } catch (e) {
      this.logger.warn(`Sincronización con OpenSearch pendiente: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.sincronizando = false;
    }
    return total;
  }

  // Reconstruye los índices desde cero (cambio de mapeo, OpenSearch nuevo).
  async reindexar(): Promise<{ indexados: number }> {
    if (!this.cliente) return { indexados: 0 };
    for (const e of ENTIDADES_BUSQUEDA) {
      await this.cliente.indices.delete({ index: this.indice(e) }).catch(() => undefined);
      await this.db.delete(busquedaIndexado).where(eq(busquedaIndexado.entidad, e));
    }
    this.indicesListos = false;
    const indexados = await this.sincronizar();
    for (const e of ENTIDADES_BUSQUEDA) await this.cliente.indices.refresh({ index: this.indice(e) });
    return { indexados };
  }

  async estado(): Promise<EstadoBusqueda> {
    const marcas = await this.db.select().from(busquedaIndexado);
    const indices: EstadoBusqueda["indices"] = [];
    let disponible = false;
    for (const e of ENTIDADES_BUSQUEDA) {
      let documentos: number | null = null;
      if (this.cliente) {
        try {
          documentos = Number((await this.cliente.count({ index: this.indice(e) })).body.count);
          disponible = true;
        } catch {
          documentos = null;
        }
      }
      indices.push({ entidad: e, documentos, indexadoHasta: marcas.find((m) => m.entidad === e)?.indexadoHasta?.toISOString() ?? null });
    }
    return { habilitado: this.habilitado, disponible, indices };
  }

  // Para pruebas: fuerza que lo indexado quede visible de inmediato.
  async refrescar() {
    if (!this.cliente) return;
    for (const e of ENTIDADES_BUSQUEDA) await this.cliente.indices.refresh({ index: this.indice(e) });
  }
}

