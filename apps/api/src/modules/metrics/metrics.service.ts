import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // HTTP request counter (labels: method, route, status, codPlan).
  readonly httpRequestsTotal = new Counter({
    name: "legalmene_http_requests_total",
    help: "Total HTTP requests served",
    labelNames: ["method", "route", "status", "cod_plan"],
    registers: [this.registry],
  });

  // Latency histogram en ms (route + method, sin cardinalidad por tenant).
  readonly httpRequestDurationMs = new Histogram({
    name: "legalmene_http_request_duration_ms",
    help: "HTTP request duration in milliseconds",
    labelNames: ["method", "route", "status"],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });

  // Negocio: contadores de entidades creadas (segmentados por codPlan).
  readonly atencionesCreadas = new Counter({
    name: "legalmene_atenciones_creadas_total",
    help: "Atenciones creadas por tipo y plan",
    labelNames: ["tipo", "cod_plan"],
    registers: [this.registry],
  });

  readonly afiliadosCreados = new Counter({
    name: "legalmene_afiliados_creados_total",
    help: "Afiliados creados por plan",
    labelNames: ["cod_plan"],
    registers: [this.registry],
  });

  readonly cargasMasivas = new Counter({
    name: "legalmene_cargas_masivas_total",
    help: "Cargas masivas procesadas por tipo y resultado",
    labelNames: ["tipo", "cod_plan", "resultado"],
    registers: [this.registry],
  });

  readonly cargasMasivasDuracionMs = new Histogram({
    name: "legalmene_cargas_masivas_duracion_ms",
    help: "Duración de cargas masivas en ms",
    labelNames: ["tipo", "cod_plan"],
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
    registers: [this.registry],
  });

  onModuleInit() {
    // Métricas default de proceso/Node (memoria, GC, event loop lag).
    collectDefaultMetrics({ register: this.registry, prefix: "legalmene_node_" });
  }
}
