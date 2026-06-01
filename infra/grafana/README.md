# Observabilidad (Prometheus + Grafana)

## Endpoints

- `GET /api/v1/metrics` (texto plano Prometheus) — scrapeable sin auth en redes internas.

## Dashboard

[`legalmene-dashboard.json`](./legalmene-dashboard.json) — importar en Grafana ≥ 10.

Paneles:

| Panel | Query base |
|---|---|
| Request rate | `sum(rate(legalmene_http_requests_total[1m]))` |
| Error rate 5xx | `100 * sum(rate(...{status=~"5.."}[5m])) / sum(rate(...[5m]))` |
| Latencia p95 | `histogram_quantile(0.95, sum by (le) (rate(...duration_ms_bucket[5m])))` |
| Event loop lag | `legalmene_node_nodejs_eventloop_lag_seconds` |
| Top 10 routes | `topk(10, sum by (route) (rate(...[5m])))` |
| Latencia p50/p95/p99 por route | `histogram_quantile(q, sum by (le, route)(...))` |
| Atenciones por tipo | `sum by (tipo) (rate(legalmene_atenciones_creadas_total[5m]))` |
| Cargas masivas | `sum by (tipo, resultado) (rate(legalmene_cargas_masivas_total[15m]))` |
| Memoria heap | `legalmene_node_nodejs_heap_*` |

## Setup Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: legalmene-api
    metrics_path: /api/v1/metrics
    static_configs:
      - targets: ["legalmene-api:3001"]
```

En AWS: ECS Service Discovery + AMP (Amazon Managed Prometheus), o sidecar prometheus-exporter por task.

## Alerts sugeridas

```yaml
groups:
  - name: legalmene
    rules:
      - alert: HighErrorRate
        expr: 100 * sum(rate(legalmene_http_requests_total{status=~"5.."}[5m])) / sum(rate(legalmene_http_requests_total[5m])) > 5
        for: 5m
        labels: { severity: warning }
        annotations: { summary: "Error rate > 5% por 5 min" }

      - alert: HighLatencyP95
        expr: histogram_quantile(0.95, sum by (le) (rate(legalmene_http_request_duration_ms_bucket[5m]))) > 1000
        for: 10m
        labels: { severity: warning }

      - alert: EventLoopLag
        expr: legalmene_node_nodejs_eventloop_lag_seconds > 0.1
        for: 5m
        labels: { severity: critical }
```
