import { TOOLS } from "./server.js";

const required = [
  "search_permits",
  "export_permits",
  "sync_permits",
  "list_permit_events",
  "get_permit",
  "get_permits_by_address",
  "get_coverage_stats",
  "list_plays",
  "system_age",
  "battery_retrofit_candidates",
  "reroof_due",
  "orphan_recovery",
  "search_contractors",
  "get_contractor",
  "get_contractor_permits",
  "get_property_history",
  "get_property_by_parcel",
  "list_webhooks",
  "create_webhook",
  "delete_webhook",
  "test_webhook",
  "get_webhook_secret",
  "metrics_monthly",
  "metrics_current",
  "metrics_cities",
  "health_check",
  "public_stats",
  "get_coverage",
  "get_permit_trend",
  "get_permit_totals",
  "get_busiest_cities",
];

const names = new Set(TOOLS.map((t) => t.name));
const missing = required.filter((n) => !names.has(n));
if (missing.length) {
  console.error("Missing tools:", missing.join(", "));
  process.exit(1);
}
if (TOOLS.length < 31) {
  console.error(`Expected at least 31 tools, got ${TOOLS.length}`);
  process.exit(1);
}
console.log(`ok: ${TOOLS.length} tools registered`);
for (const t of TOOLS) {
  console.log(`- ${t.method.padEnd(6)} ${t.path.padEnd(42)} ${t.name}`);
}
