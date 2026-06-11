#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.argv[2] || process.env.IMAGE_MCP_HTTP_PORT || 3333);
const host = process.env.IMAGE_MCP_HTTP_HOST || '127.0.0.1';

async function main() {
  const proc = spawn('node', ['./server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, IMAGE_MCP_TRANSPORT: 'http', IMAGE_MCP_HTTP_PORT: String(port), IMAGE_MCP_HTTP_HOST: host },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    let ready = false;
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (text.includes(`img-gen-mcp http listening on http://${host}:${port}`)) ready = true;
    });

    for (let i = 0; i < 60; i += 1) {
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('HTTP server did not become ready');

    console.log('HTTP_OK');
  } finally {
    proc.kill('SIGTERM');
    await Promise.race([once(proc, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
