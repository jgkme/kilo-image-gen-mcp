#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const stateFile = path.join(root, '.image-mcp-workflows.json');
const server = path.join(root, 'server.js');

function parseJsonLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function spawnServer() {
  const child = spawn('node', [server], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  const pending = new Map();
  let nextId = 0;
  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      const msg = parseJsonLine(line);
      if (msg?.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  function call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', 'utf8', (error) => {
        if (error) {
          pending.delete(id);
          reject(error);
        }
      });
    });
  }

  return { child, call };
}

function parseText(response) {
  return response?.result?.content?.find?.((entry) => entry.type === 'text')?.text || '';
}

function parseWorkflow(text) {
  return JSON.parse(text);
}

async function main() {
  await Promise.allSettled([fs.unlink(stateFile)]);

  const { child, call } = spawnServer();
  try {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'workflow-test', version: '1' } });
    await call('notifications/initialized', {});

    const created = parseWorkflow(parseText(await call('tools/call', {
      name: 'create_workflow',
      arguments: { objective: 'workflow regression test', prompt: 'workflow regression test', provider: 'openrouter' }
    })));

    if (!created.workflow_id) throw new Error('create_workflow did not return workflow_id');

    const onDisk = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    if (!Array.isArray(onDisk.workflows) || !onDisk.workflows.some((workflow) => workflow.workflow_id === created.workflow_id)) {
      throw new Error(`Workflow ${created.workflow_id} was not persisted`);
    }

    const resumed = parseWorkflow(parseText(await call('tools/call', {
      name: 'resume_workflow',
      arguments: { workflow_id: created.workflow_id }
    })));

    if (resumed.workflow_id !== created.workflow_id) throw new Error('resume_workflow returned a different workflow');

    const stepAdded = parseWorkflow(parseText(await call('tools/call', {
      name: 'add_workflow_step',
      arguments: {
        workflow_id: created.workflow_id,
        tool: 'generate_image',
        status: 'completed',
        summary: 'Initial image created',
        result: { output_path: 'generated-images/example.png' }
      }
    })));

    if (!Array.isArray(stepAdded.steps) || stepAdded.steps.length !== 1) throw new Error('add_workflow_step did not append a step');

    const closed = parseWorkflow(parseText(await call('tools/call', {
      name: 'close_workflow_step',
      arguments: {
        workflow_id: created.workflow_id,
        step_id: stepAdded.steps[0].step_id,
        status: 'completed',
        summary: 'Finalized for delivery'
      }
    })));

    if (closed.steps[0].status !== 'completed') throw new Error('close_workflow_step did not update step status');

    console.log(`WORKFLOW_OK:${created.workflow_id}`);
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
