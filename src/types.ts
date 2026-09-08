export type JsonSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

export type ToolOp = {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  summary: string;
  tags: string[];
  properties: Record<string, JsonSchema>;
  required: string[];
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
  alias_of?: string;
};

export type OpsFile = {
  ops: ToolOp[];
};
