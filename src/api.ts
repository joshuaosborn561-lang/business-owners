import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ToolOp } from "./types.js";

export const VERSION = "2.0.0";
export const API_BASE =
  process.env.PERMITSTACK_API_URL || "https://api.permit-stack.com";

export function requireApiKey(): string {
  const key = process.env.PERMITSTACK_API_KEY;
  if (!key) {
    throw new Error(
      "PERMITSTACK_API_KEY is required. Get a key at https://permit-stack.com/#pricing"
    );
  }
  return key;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function callPermitStack(
  op: ToolOp,
  args: Record<string, unknown>,
  apiKey: string
): Promise<unknown> {
  const params = { ...args };

  if (op.name === "get_permit") {
    const permitId = typeof params.permit_id === "string" ? params.permit_id : "";
    const permitNumber =
      typeof params.permit_number === "string" ? params.permit_number : "";
    if (!permitId && permitNumber) {
      return callPermitStack(
        {
          ...op,
          name: "search_permits",
          method: "GET",
          path: "/v1/permits/search",
          pathParams: [],
          queryParams: ["q", "city", "state", "per_page"],
          bodyParams: [],
        },
        { q: permitNumber, per_page: 5 },
        apiKey
      );
    }
    if (permitId && !isUuid(permitId) && !permitNumber) {
      return callPermitStack(
        {
          ...op,
          name: "search_permits",
          method: "GET",
          path: "/v1/permits/search",
          pathParams: [],
          queryParams: ["q", "per_page"],
          bodyParams: [],
        },
        { q: permitId, per_page: 5 },
        apiKey
      );
    }
    delete params.permit_number;
  }

  let path = op.path.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = params[key];
    delete params[key];
    if (value === undefined || value === null || value === "") {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required path parameter: ${key}`
      );
    }
    return encodeURIComponent(String(value));
  });

  const url = new URL(path, API_BASE);
  const body: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (op.bodyParams.includes(key)) {
      body[key] = value;
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json, text/csv, */*",
    "User-Agent": `permitstack-mcp/${VERSION}`,
  };

  const init: RequestInit = { method: op.method, headers };
  if (op.method !== "GET" && op.method !== "DELETE" && Object.keys(body).length) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), init);
  const text = await response.text();

  if (!response.ok) {
    throw new McpError(
      ErrorCode.InternalError,
      `PermitStack API error ${response.status}: ${text || response.statusText}`
    );
  }

  if (!text) return { ok: true, status: response.status };

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return { content_type: contentType, body: text };
}
