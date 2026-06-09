#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2).replace(/-/g, '_');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    if (next === 'true' || next === 'false') {
      args[key] = next === 'true';
    } else if (['max_resolution', 'width', 'height'].includes(key) && Number.isFinite(Number(next))) {
      args[key] = Number(next);
    } else {
      args[key] = next;
    }
    i += 1;
  }
  return args;
}

function rpcClient(child) {
  let id = 0;
  const pending = new Map();
  const rl = readline.createInterface({ input: child.stdout });

  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      process.stderr.write(line + '\n');
    }
  });

  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return {
    call(method, params) {
      return new Promise((resolve) => {
        const reqId = ++id;
        pending.set(reqId, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: reqId, method, params }) + '\n');
      });
    }
  };
}

const args = parseArgs(process.argv.slice(2));
const provider = String(args.provider || 'openrouter').toLowerCase();
const tool = String(args.tool || 'generate_image');
const prompt = args.prompt || 'a colorful parrot perched on a branch, simple background';
const outputPath = args.output || `generated-images/${provider}-${tool}.png`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
try { await fs.unlink(outputPath); } catch {}

const env = { ...process.env };
const child = spawn('node', ['./server.js'], { cwd: process.cwd(), env });
const rpc = rpcClient(child);

await rpc.call('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'smoke-image', version: '1' }
});
await rpc.call('notifications/initialized', {});

const callArgs = {
  provider,
  prompt,
  output_path: outputPath,
  ...(args.model ? { model: args.model } : {}),
  ...(args.quality ? { quality: args.quality } : {}),
  ...(args.purpose ? { purpose: args.purpose } : {}),
  ...(args.style ? { style: args.style } : {}),
  ...(args.input_image ? { input_image: args.input_image } : {}),
  ...(args.reference_image ? { reference_image: args.reference_image } : {}),
  ...(args.width !== undefined ? { width: Number(args.width) } : {}),
  ...(args.height !== undefined ? { height: Number(args.height) } : {}),
  ...(args.fit ? { fit: args.fit } : {}),
  ...(args.gravity ? { gravity: args.gravity } : {}),
  ...(args.background ? { background: args.background } : {}),
  ...(args.max_resolution !== undefined ? { max_resolution: Number(args.max_resolution) } : {}),
  ...(args.backend ? { backend: args.backend } : {}),
  ...(args.remove_background !== undefined ? { remove_background: args.remove_background } : {}),
  ...(args.background_backend ? { background_backend: args.background_backend } : {}),
  ...(args.background_model ? { background_model: args.background_model } : {}),
  ...(args.trim !== undefined ? { trim: args.trim } : {})
};

const response = await rpc.call('tools/call', { name: tool, arguments: callArgs });
console.log(JSON.stringify(response, null, 2));
child.kill('SIGTERM');

const stat = await fs.stat(path.resolve(outputPath));
console.log(`SAVED:${path.resolve(outputPath)}:${stat.size}`);
