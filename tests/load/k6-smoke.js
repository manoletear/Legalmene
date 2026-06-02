// k6 load test smoke. Ejecutar:
//   API_BASE=http://localhost:3001/api/v1 X_COD_PLAN=DEMO k6 run tests/load/k6-smoke.js
//
// Trayectoria realista: dashboard + listar afiliados + listar atenciones +
// crear consulta + buscar full-text. Refleja la sesión típica del usuario.
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const API = __ENV.API_BASE ?? "http://localhost:3001/api/v1";
const COD_PLAN = __ENV.X_COD_PLAN ?? "DEMO";

export const options = {
  scenarios: {
    smoke: {
      executor: "ramping-vus",
      stages: [
        { duration: "10s", target: 5 },   // ramp to 5 VUs
        { duration: "30s", target: 20 },  // ramp to 20 VUs
        { duration: "20s", target: 20 },  // sustain
        { duration: "10s", target: 0 },   // ramp down
      ],
    },
  },
  thresholds: {
    "http_req_duration": ["p(95)<500", "p(99)<1500"], // latencia
    "http_req_failed": ["rate<0.01"], // < 1% errores
    "checks": ["rate>0.99"],
  },
};

// Pre-fetch afiliados activos al inicio (compartido entre VUs).
const afiliados = new SharedArray("afiliados", function () {
  const res = http.get(`${API}/afiliados?pageSize=50`, {
    headers: { "X-Cod-Plan": COD_PLAN },
  });
  if (res.status !== 200) return [];
  const body = JSON.parse(res.body);
  return (body.data ?? []).filter((a) => a.vigencia === "Activo");
});

export default function () {
  const headers = { "X-Cod-Plan": COD_PLAN };

  // 1. Dashboard KPIs (cached, debería ser muy rápido)
  let r = http.get(`${API}/dashboard/kpis`, { headers });
  check(r, { "kpis 200": (x) => x.status === 200 });

  // 2. Listar afiliados primera página
  r = http.get(`${API}/afiliados?page=1&pageSize=25`, { headers });
  check(r, { "afiliados 200": (x) => x.status === 200 });

  // 3. Listar atenciones
  r = http.get(`${API}/atenciones?page=1&pageSize=25`, { headers });
  check(r, { "atenciones 200": (x) => x.status === 200 });

  // 4. Full-text search
  r = http.get(`${API}/atenciones?q=despido`, { headers });
  check(r, { "search 200": (x) => x.status === 200 });

  // 5. Gestiones globales
  r = http.get(`${API}/gestiones?soloVencidas=true`, { headers });
  check(r, { "gestiones 200": (x) => x.status === 200 });

  sleep(1);
}
