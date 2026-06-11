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

function summarizeContent(content = []) {
  const text = content.find((c) => c.type === 'text')?.text || '';
  const summary = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^[-*]\s+(Path|MIME type|Size|Model|Backend|Action):\s+`([^`]+)`$/);
    if (match) summary[match[1].toLowerCase().replace(/\s+/g, '_')] = match[2];
  }
  const pathValue = summary.path || 'unknown';
  const parts = [summary.action || 'image', pathValue];
  if (summary.backend || summary.model) parts.push(`[${[summary.backend, summary.model].filter(Boolean).join('/')}]`);
  if (summary.size) parts.push(summary.size);
  return parts.join(' ');
}

function parseJsonContent(content = []) {
  const text = content.find((c) => c.type === 'text')?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractStructuredResult(response) {
  const parsed = parseJsonContent(response?.result?.content);
  return parsed && typeof parsed === 'object' ? parsed : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rpcClient(child, verbose = false) {
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
      if (verbose) process.stderr.write(line + '\n');
    }
  });

  if (verbose) {
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }

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
const jsonOutput = Boolean(args.json);
const verbose = Boolean(args.verbose);
const localEndpoint = args.local_endpoint || process.env.IMAGE_MCP_LOCAL_ENDPOINT;
const workflowIdFile = path.resolve('.image-mcp-last-workflow-id');
let cachedWorkflowId = args.workflow_id;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
try { await fs.unlink(outputPath); } catch {}

const env = { ...process.env };
if (localEndpoint) env.IMAGE_MCP_LOCAL_ENDPOINT = localEndpoint;
if (args.local_provider) env.IMAGE_MCP_LOCAL_PROVIDER = String(args.local_provider);
if (args.local_model) env.IMAGE_MCP_LOCAL_MODEL = String(args.local_model);
const child = spawn('node', ['./server.js'], { cwd: process.cwd(), env });
const rpc = rpcClient(child, verbose);

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
  ...(args.input_mode ? { input_mode: args.input_mode } : {}),
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

if (['get_workflow', 'resume_workflow', 'update_workflow', 'finalize_workflow', 'suggest_next_step'].includes(tool)) {
  try { cachedWorkflowId = cachedWorkflowId || String(await fs.readFile(workflowIdFile, 'utf8')).trim(); } catch {}
  if (cachedWorkflowId) callArgs.workflow_id = cachedWorkflowId;
}

const response = await rpc.call('tools/call', { name: tool, arguments: callArgs });
if (jsonOutput) {
  console.log(JSON.stringify(response, null, 2));
} else if (response?.result?.isError) {
  console.log(JSON.stringify(response.result.content, null, 2));
} else {
  console.log(summarizeContent(response?.result?.content));
}

if (tool === 'submit_task') {
  const submitted = parseJsonContent(response?.result?.content);
  const taskId = submitted?.task_id;
  if (!taskId) throw new Error('submit_task did not return a task_id');
  let task;
  for (let i = 0; i < 20; i += 1) {
    const taskResponse = await rpc.call('tools/call', { name: 'get_task', arguments: { task_id: taskId } });
    task = parseJsonContent(taskResponse?.result?.content);
    if (task?.status === 'completed' || task?.status === 'failed') {
      if (jsonOutput) console.log(JSON.stringify(taskResponse, null, 2));
      else console.log(`TASK:${task.task_id}:${task.status}`);
      break;
    }
    await sleep(500);
  }
  if (!task) throw new Error(`Task ${taskId} did not resolve`);
}

if (tool === 'create_workflow') {
  const parsed = extractStructuredResult(response);
  if (parsed?.workflow_id) {
    cachedWorkflowId = parsed.workflow_id;
    await fs.writeFile(workflowIdFile, parsed.workflow_id);
  }
}

if (tool === 'resume_workflow' && !args.workflow_id) {
  try { callArgs.workflow_id = String(await fs.readFile(workflowIdFile, 'utf8')).trim(); } catch {}
}

if (tool === 'create_workflow' || tool === 'get_workflow' || tool === 'resume_workflow' || tool === 'update_workflow' || tool === 'finalize_workflow' || tool === 'suggest_next_step' || tool === 'analyze_image_result' || tool === 'inspect_cutout' || tool === 'compare_variants') {
  const parsed = extractStructuredResult(response);
  if (parsed?.workflow_id) console.log(`WORKFLOW:${parsed.workflow_id}`);
  if (parsed?.suggestion?.suggested_tool) console.log(`SUGGEST:${parsed.suggestion.suggested_tool}`);
  if (Array.isArray(parsed?.next_steps) && parsed.next_steps.length) console.log(`NEXT:${parsed.next_steps[0].suggested_tool}`);
}

const noFileTools = new Set(['create_workflow', 'resume_workflow', 'update_workflow', 'get_workflow', 'finalize_workflow', 'suggest_next_step', 'analyze_image_result', 'inspect_cutout', 'compare_variants']);

if (tool === 'batch_generate_image') {
  const batch = parseJsonContent(response?.result?.content);
  const results = Array.isArray(batch?.results) ? batch.results : [];
  if (!results.length) throw new Error('batch_generate_image did not return results');
  for (const item of results) {
    const resolved = item?.output_path ? path.resolve(item.output_path) : undefined;
    if (!resolved) continue;
    const stat = await fs.stat(resolved);
    console.log(`SAVED:${resolved}:${stat.size}`);
  }
} else if (!noFileTools.has(tool)) {
  const stat = await fs.stat(path.resolve(outputPath));
  console.log(`SAVED:${path.resolve(outputPath)}:${stat.size}`);
}

if (tool === 'generate_image' || tool === 'edit_image') {
  const parsed = extractStructuredResult(response);
  if (parsed?.workflow_id) console.log(`WORKFLOW:${parsed.workflow_id}`);
  if (Array.isArray(parsed?.next_steps) && parsed.next_steps.length) console.log(`NEXT:${parsed.next_steps[0].suggested_tool}`);
}

if (tool === 'generate_image' || tool === 'edit_image') {
  const parsed = extractStructuredResult(response);
  if (parsed?.analysis?.asset_class) console.log(`ASSET:${parsed.analysis.asset_class}`);
}

if (tool === 'generate_image' && ['openai-compatible', 'comfyui', 'drawthings', 'mlx'].includes(provider)) {
  console.log(`LOCAL:${provider}:${args.input_mode || 'text-to-image'}`);
}

child.kill('SIGTERM');
