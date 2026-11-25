import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CrearNota, NotaAtencion } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { notasAtencion } from "../../db/schema/notas";
import { atenciones } from "../../db/schema/atenciones";
import { usuarios } from "../../db/schema/usuarios";
import { asegurarAtencionVisible } from "../../common/acceso/alcance";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { jefeDe, usuariosConPermiso } from "../notif-inbox/destinatarios";

const autor = alias(usuarios, "autor");
const destino = alias(usuarios, "destino");

@Injectable()
export class NotasService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  async listar(atencionId: string): Promise<NotaAtencion[]> {
    await asegurarAtencionVisible(this.db, atencionId);
    const filas = await this.db
      .select({
        id: notasAtencion.id,
        atencionId: notasAtencion.atencionId,
        texto: notasAtencion.texto,
        autorId: notasAtencion.autorId,
        autor: autor.nombre,
        destinatarioId: notasAtencion.destinatarioId,
        destinatario: destino.nombre,
        createdAt: notasAtencion.createdAt,
      })
      .from(notasAtencion)
      .innerJoin(autor, eq(autor.id, notasAtencion.autorId))
      .leftJoin(destino, eq(destino.id, notasAtencion.destinatarioId))
      .where(eq(notasAtencion.atencionId, atencionId))
      .orderBy(asc(notasAtencion.createdAt));
    return filas.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));
  }

  // La nota avisa al destinatario (por defecto, el abogado asignado), nunca a quien la escribe.
  async crear(atencionId: string, autorId: string, input: CrearNota): Promise<NotaAtencion> {
    await asegurarAtencionVisible(this.db, atencionId);
    const [a] = await this.db
      .select({ abogadoId: atenciones.abogadoAsignadoId, creadoPorId: atenciones.creadoPorId, correlativo: atenciones.correlativo, codPlan: atenciones.codPlan })
      .from(atenciones)
      .where(eq(atenciones.id, atencionId));
    const destinatarioId = input.destinatarioId ?? a.abogadoId ?? null;
    if (input.destinatarioId) {
      const [u] = await this.db.select({ id: usuarios.id, activo: usuarios.activo }).from(usuarios).where(eq(usuarios.id, input.destinatarioId));
      if (!u?.activo) throw new BadRequestException("El destinatario no existe o no está activo");
      // Solo alguien que ve la atención: su abogado, quien la creó, la jefatura del abogado o quien ve todas.
      const permitidos = new Set([a.abogadoId, a.creadoPorId, await jefeDe(this.db, a.abogadoId), ...(await usuariosConPermiso(this.db, ["atenciones.ver_todas"]))]);
      if (!permitidos.has(input.destinatarioId)) throw new BadRequestException("El destinatario no tiene acceso a esta atención");
    }
    const [n] = await this.db.insert(notasAtencion).values({ atencionId, texto: input.texto, autorId, destinatarioId }).returning();
    if (destinatarioId && destinatarioId !== autorId) {
      await this.notif.crear({
        codPlan: a.codPlan,
        usuarioId: destinatarioId,
        severidad: "info",
        titulo: `Nota en ${a.correlativo}`,
        detalle: input.texto.slice(0, 200),
        accionUrl: `/atenciones/${atencionId}`,
      });
    }
    return (await this.listar(atencionId)).find((x) => x.id === n.id)!;
  }
}
