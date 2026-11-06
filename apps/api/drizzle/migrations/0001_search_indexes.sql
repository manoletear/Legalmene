-- Búsqueda full-text en atenciones y afiliados sin OpenSearch.
-- to_tsvector('spanish', ...) es STABLE y PG rechaza columnas GENERATED
-- referenciando funciones no-IMMUTABLE. Usamos trigger BEFORE INSERT/UPDATE
-- para mantener el tsvector y un índice GIN para búsquedas O(log n).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ATENCIONES
ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION atenciones_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('spanish', coalesce(NEW.correlativo, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.materia, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.descripcion, '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(NEW.competencia::text, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atenciones_search_vector_trg ON atenciones;
CREATE TRIGGER atenciones_search_vector_trg
  BEFORE INSERT OR UPDATE OF correlativo, materia, descripcion, competencia
  ON atenciones FOR EACH ROW EXECUTE FUNCTION atenciones_search_vector_update();

-- Backfill para filas existentes.
UPDATE atenciones SET correlativo = correlativo;

CREATE INDEX IF NOT EXISTS atenciones_search_idx ON atenciones USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS atenciones_correlativo_trgm_idx ON atenciones USING GIN (correlativo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS atenciones_materia_trgm_idx ON atenciones USING GIN (materia gin_trgm_ops);

-- AFILIADOS
ALTER TABLE afiliados ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION afiliados_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('spanish', coalesce(NEW.rut, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.nombres, '') || ' ' || coalesce(NEW.apellido_paterno, '') || ' ' || coalesce(NEW.apellido_materno, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.email, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS afiliados_search_vector_trg ON afiliados;
CREATE TRIGGER afiliados_search_vector_trg
  BEFORE INSERT OR UPDATE OF rut, nombres, apellido_paterno, apellido_materno, email
  ON afiliados FOR EACH ROW EXECUTE FUNCTION afiliados_search_vector_update();

UPDATE afiliados SET rut = rut;

CREATE INDEX IF NOT EXISTS afiliados_search_idx ON afiliados USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS afiliados_rut_trgm_idx ON afiliados USING GIN (rut gin_trgm_ops);
