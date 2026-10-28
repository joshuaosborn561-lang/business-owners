import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { mcpAuthMiddleware } from './http.js';
import { healthPayload } from './createServer.js';

function run(headers: Record<string, string>, query: Record<string, unknown>, token?: string) {
  const prev = process.env.MCP_AUTH_TOKEN;
  if (token === undefined) delete process.env.MCP_AUTH_TOKEN;
  else process.env.MCP_AUTH_TOKEN = token;
  let status = 0;
  let nexted = false;
  const res = { status: (s: number) => { status = s; return { json: () => undefined }; } } as unknown as Response;
  mcpAuthMiddleware({ headers, query } as unknown as Request, res, () => { nexted = true; });
  if (prev === undefined) delete process.env.MCP_AUTH_TOKEN;
  else process.env.MCP_AUTH_TOKEN = prev;
  return { status, nexted };
}

describe('optional /mcp shared secret', () => {
  it('is off (open, as before) when MCP_AUTH_TOKEN is unset', () => {
    assert.deepEqual(run({}, {}), { status: 0, nexted: true });
  });
  it('accepts Bearer or ?key= and rejects everything else', () => {
    assert.equal(run({ authorization: 'Bearer s3cret' }, {}, 's3cret').nexted, true);
    assert.equal(run({}, { key: 's3cret' }, 's3cret').nexted, true);
    for (const [h, q] of [[{}, {}], [{ authorization: 'Bearer nope' }, {}], [{}, { key: 's3cre' }], [{}, { key: ['s3cret'] }], [{ authorization: 's3cret' }, {}]] as const) {
      const r = run({ ...h }, { ...q }, 's3cret');
      assert.equal(r.nexted, false);
      assert.equal(r.status, 401);
    }
  });
});

describe('health lists the table tools', () => {
  it('names them and reports whether table jobs are configured', () => {
    const h = healthPayload() as { tools: string[]; table_jobs_configured: boolean };
    for (const t of ['start_table_job', 'get_table_job_status', 'export_table_job_summary', 'resume_table_job', 'cancel_table_job']) {
      assert.ok(h.tools.includes(t), t);
    }
    assert.equal(typeof h.table_jobs_configured, 'boolean');
  });
});
