#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.argv[2] || process.env.IMAGE_MCP_HTTP_PORT || 3333);
const host = process.env.IMAGE_MCP_HTTP_HOST || '127.0.0.1';
const baseUrl = `http://${host}:${port}`;

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  return { response, body };
}

async function waitForHealth() {
  for (let index = 0; index < 60; index += 1) {
    try {
      const { response, body } = await fetchJson('/acp/health');
      if (response.ok && body?.status === 'ok') return body;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('ACP health endpoint did not become ready');
}

async function main() {
  const proc = spawn('node', ['./server.js', 'http', '--acp'], {
    cwd: process.cwd(),
    env: { ...process.env, IMAGE_MCP_HTTP_PORT: String(port), IMAGE_MCP_HTTP_HOST: host, IMAGE_MCP_ACP: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    const stderr = [];
    proc.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));

    await waitForHealth();

    const tools = await fetchJson('/acp/tools');
    if (!tools.response.ok || !Array.isArray(tools.body?.result)) throw new Error('ACP tools endpoint did not return a tool list');
    if (!tools.body.result.some((tool) => tool.name === 'generate_image')) throw new Error('ACP tools list is missing generate_image');

    const created = await fetchJson('/acp/workflows', {
      method: 'POST',
      body: JSON.stringify({ objective: 'acp smoke test', prompt: 'acp smoke test', context: { source: 'test' } })
    });
    if (!created.response.ok || !created.body?.result?.workflow_id) throw new Error('ACP workflow creation failed');

    const workflowId = created.body.result.workflow_id;
    const stepAdded = await fetchJson(`/acp/workflows/${workflowId}/steps`, {
      method: 'POST',
      body: JSON.stringify({ tool: 'generate_image', summary: 'queued by smoke test' })
    });
    if (!stepAdded.response.ok || !Array.isArray(stepAdded.body?.result?.steps) || !stepAdded.body.result.steps.length) throw new Error('ACP workflow step append failed');

    const stepId = stepAdded.body.result.steps[0].step_id;
    const closed = await fetchJson(`/acp/workflows/${workflowId}/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', summary: 'closed by smoke test' })
    });
    if (!closed.response.ok || closed.body?.result?.steps?.[0]?.status !== 'completed') throw new Error('ACP workflow step close failed');

    console.log('ACP_OK');
  } finally {
    proc.kill('SIGTERM');
    await Promise.race([once(proc, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
