import { expect, test } from "@playwright/test";

test.describe("Metrics", () => {
  test("/api/v1/metrics expone counters Prometheus", async ({ request }) => {
    // Genera tráfico para registrar al menos un sample.
    await request.get("http://localhost:3001/api/v1/health");

    const res = await request.get("http://localhost:3001/api/v1/metrics");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("legalmene_http_requests_total");
    expect(body).toContain("legalmene_http_request_duration_ms_bucket");
    expect(body).toContain("legalmene_node_");
  });
});
