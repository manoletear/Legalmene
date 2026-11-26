// Índices, mapeos y consultas de OpenSearch (búsqueda de texto completo, §XI del Anexo).
// OpenSearch solo devuelve ids candidatos; el alcance y los demás filtros los aplica siempre la base.

export type EntidadBusqueda = "atenciones" | "afiliados";
export const ENTIDADES_BUSQUEDA: EntidadBusqueda[] = ["atenciones", "afiliados"];

// Tope de candidatos por consulta: la página final la arma la base con ellos.
export const MAX_CANDIDATOS = 1000;

const analisis = {
  analysis: {
    filter: {
      es_stop: { type: "stop", stopwords: "_spanish_" },
      es_stemmer: { type: "stemmer", language: "light_spanish" },
    },
    analyzer: {
      // Sin tildes ni mayúsculas, con raíces en español ("divorcios" encuentra "divorcio").
      es_texto: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding", "es_stop", "es_stemmer"] },
    },
    normalizer: { plano: { type: "custom", filter: ["lowercase", "asciifolding"] } },
  },
};

const texto = { type: "text", analyzer: "es_texto" };
const clave = { type: "keyword", normalizer: "plano" };

export const MAPEOS: Record<EntidadBusqueda, Record<string, unknown>> = {
  atenciones: {
    settings: { ...analisis, number_of_shards: 1 },
    mappings: {
      dynamic: "strict",
      properties: {
        correlativo: { ...texto, fields: { exacto: clave } },
        rut: clave,
        tipo: { type: "keyword" },
        estado: { type: "keyword" },
        asunto: texto,
        descripcion: texto,
        respuesta: texto,
        materia: texto,
        competencia: texto,
        afiliado: texto,
        abogado: texto,
        gestiones: texto,
        fechaApertura: { type: "date" },
      },
    },
  },
  afiliados: {
    settings: { ...analisis, number_of_shards: 1 },
    mappings: {
      dynamic: "strict",
      properties: {
        rut: clave,
        nombre: texto,
        email: { ...texto, fields: { exacto: clave } },
        telefono: clave,
        comuna: texto,
      },
    },
  },
};

// RUT comparable: solo dígitos y K, como en la base (rutComparable).
export function rutPlano(rut: string | null | undefined): string {
  return (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export interface FilaAtencionBusqueda {
  id: string;
  correlativo: string;
  tipo: string;
  estado: string;
  asunto: string;
  descripcion: string | null;
  respuesta: string | null;
  materia: string | null;
  competencia: string | null;
  afiliado: string | null;
  rut: string | null;
  abogado: string | null;
  gestiones: string | null;
  fechaApertura: Date;
}

export function documentoAtencion(f: FilaAtencionBusqueda) {
  return {
    correlativo: f.correlativo,
    rut: rutPlano(f.rut),
    tipo: f.tipo,
    estado: f.estado,
    asunto: f.asunto,
    descripcion: f.descripcion ?? "",
    respuesta: f.respuesta ?? "",
    materia: f.materia ?? "",
    competencia: f.competencia ?? "",
    afiliado: f.afiliado ?? "",
    abogado: f.abogado ?? "",
    gestiones: f.gestiones ?? "",
    fechaApertura: f.fechaApertura.toISOString(),
  };
}

export interface FilaAfiliadoBusqueda {
  id: string;
  rut: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  comuna: string | null;
}

export function documentoAfiliado(f: FilaAfiliadoBusqueda) {
  return { rut: rutPlano(f.rut), nombre: f.nombre, email: f.email ?? "", telefono: f.telefono ?? "", comuna: f.comuna ?? "" };
}

// Consulta: coincidencias exactas de correlativo o RUT primero; luego texto con tolerancia a errores.
export function consulta(entidad: EntidadBusqueda, q: string) {
  const t = q.trim();
  const rut = rutPlano(t);
  const exactos: Record<string, unknown>[] = [];
  if (rut.length >= 6 && /^\d+K?$/.test(rut)) exactos.push({ prefix: { rut: { value: rut, boost: 20 } } });
  if (entidad === "atenciones") {
    exactos.push({ term: { "correlativo.exacto": { value: t.toLowerCase(), boost: 30 } } });
    return {
      size: MAX_CANDIDATOS,
      _source: false,
      query: {
        bool: {
          should: [
            ...exactos,
            {
              multi_match: {
                query: t,
                fields: ["correlativo^5", "asunto^3", "materia^2", "afiliado^2", "competencia", "descripcion", "respuesta", "gestiones", "abogado"],
                type: "best_fields",
                operator: "and",
                fuzziness: "AUTO",
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    };
  }
  exactos.push({ term: { "email.exacto": { value: t.toLowerCase(), boost: 20 } } });
  return {
    size: MAX_CANDIDATOS,
    _source: false,
    query: {
      bool: {
        should: [
          ...exactos,
          { multi_match: { query: t, fields: ["nombre^3", "email", "comuna", "telefono"], type: "best_fields", operator: "and", fuzziness: "AUTO" } },
        ],
        minimum_should_match: 1,
      },
    },
  };
}
