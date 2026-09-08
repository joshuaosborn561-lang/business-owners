# PermitStack MCP Server

Remote [MCP](https://modelcontextprotocol.io) server for the [PermitStack](https://permit-stack.com) building permit API.

Exposes **every public PermitStack API call** as a tool (27 endpoints from the official OpenAPI spec, plus the four names from the official `permitstack-mcp` package).

Works two ways:

- **HTTPS (Claude web)** — Streamable HTTP at `/mcp`. Paste that URL into Claude → Customize → Connectors.
- **stdio (Claude Desktop / local agents)** — `npx` / `node dist/index.js` with `PERMITSTACK_API_KEY`.

## Claude web (HTTPS)

1. Open [claude.ai/settings/connectors](https://claude.ai/settings/connectors)
2. Click **Add custom connector**
3. Name it `PermitStack`
4. Paste the Railway URL:

```text
https://YOUR-RAILWAY-DOMAIN.up.railway.app/mcp
```

5. Click **Add**, start a new chat, and enable the connector

The landing page on the same host also shows the URL.

## Tools

Every operation in [https://api.permit-stack.com/public-openapi.json](https://api.permit-stack.com/public-openapi.json):

| Tool | Method | Path |
|------|--------|------|
| `health_check` | GET | `/health` |
| `public_stats` | GET | `/stats` |
| `search_permits` | GET | `/v1/permits/search` |
| `export_permits` | GET | `/v1/permits/export` |
| `sync_permits` | GET | `/v1/permits/sync` |
| `list_permit_events` | GET | `/v1/permits/events` |
| `get_permit` | GET | `/v1/permits/{permit_id}` |
| `get_permits_by_address` | GET | `/v1/permits/address/{address}` |
| `get_coverage_stats` / `get_coverage` | GET | `/v1/permits/stats/coverage` |
| `list_plays` | GET | `/v1/plays` |
| `system_age` | GET | `/v1/plays/system-age` |
| `battery_retrofit_candidates` | GET | `/v1/plays/battery-retrofit-candidates` |
| `reroof_due` | GET | `/v1/plays/reroof-due` |
| `orphan_recovery` | GET | `/v1/plays/orphan-recovery` |
| `search_contractors` | GET | `/v1/contractors/search` |
| `get_contractor` | GET | `/v1/contractors/{contractor_id}` |
| `get_contractor_permits` | GET | `/v1/contractors/{contractor_id}/permits` |
| `get_property_history` | GET | `/v1/property/history` |
| `get_property_by_parcel` | GET | `/v1/property/by-parcel` |
| `list_webhooks` | GET | `/v1/webhooks/` |
| `create_webhook` | POST | `/v1/webhooks/` |
| `delete_webhook` | DELETE | `/v1/webhooks/{webhook_id}` |
| `test_webhook` | POST | `/v1/webhooks/{webhook_id}/test` |
| `get_webhook_secret` | GET | `/v1/webhooks/{webhook_id}/secret` |
| `metrics_monthly` / `get_permit_trend` | GET | `/v1/metrics/monthly` |
| `metrics_current` / `get_permit_totals` | GET | `/v1/metrics/current` |
| `metrics_cities` / `get_busiest_cities` | GET | `/v1/metrics/cities` |

`get_permit` accepts either a UUID `permit_id` or a jurisdiction `permit_number` (resolved via search).

## Local / stdio

```bash
cp .env.example .env   # then set PERMITSTACK_API_KEY
npm install
npm run build
PERMITSTACK_API_KEY=pk_... npm start          # HTTP on $PORT (default 8080)
PERMITSTACK_API_KEY=pk_... npm run start:stdio
```

Claude Desktop config:

```json
{
  "mcpServers": {
    "permitstack": {
      "command": "node",
      "args": ["/absolute/path/to/permitstack-mcp/dist/index.js"],
      "env": {
        "PERMITSTACK_API_KEY": "pk_your_key_here"
      }
    }
  }
}
```

## Railway

The HTTP server reads `PORT` and `PERMITSTACK_API_KEY`. Set the key as a Railway variable — do not commit it.

```bash
railway up -y
railway variable set PERMITSTACK_API_KEY=pk_...
railway domain
```

Claude connector URL is `https://<railway-public-domain>/mcp`.

## Auth

The PermitStack key stays on the server (`X-API-Key`). Claude never sees it.

If this key was pasted into chat, rotate it at [permit-stack.com](https://permit-stack.com) after connecting.

## License

Apache-2.0
