#!/usr/bin/env node
import process from 'node:process';

const provider = String(process.env.IMAGE_MCP_LOCAL_PROVIDER || 'openai-compatible').trim().toLowerCase();
const endpoint = String(process.env.IMAGE_MCP_LOCAL_ENDPOINT || '').trim();
const model = String(process.env.IMAGE_MCP_LOCAL_MODEL || '').trim();

function print(lines) {
  process.stdout.write(lines.join('\n') + '\n');
}

if (provider === 'mlx') {
  print([
    'uv run python -m mlx_vlm.server --host 127.0.0.1 --port 8000',
    `export IMAGE_MCP_LOCAL_PROVIDER=mlx`,
    `export IMAGE_MCP_LOCAL_ENDPOINT=${endpoint || 'http://127.0.0.1:8000/v1'}`,
    `export IMAGE_MCP_LOCAL_MODEL=${model || 'qwen3.5'}`
  ]);
} else if (provider === 'openai-compatible') {
  print([
    'python -m llama_cpp.server --host 127.0.0.1 --port 8080',
    `export IMAGE_MCP_LOCAL_PROVIDER=openai-compatible`,
    `export IMAGE_MCP_LOCAL_ENDPOINT=${endpoint || 'http://127.0.0.1:8080/v1'}`,
    `export IMAGE_MCP_LOCAL_MODEL=${model || 'local-model'}`
  ]);
} else if (provider === 'comfyui') {
  print([
    'Start ComfyUI and expose a compatible workflow endpoint.',
    `export IMAGE_MCP_LOCAL_PROVIDER=comfyui`,
    `export IMAGE_MCP_LOCAL_ENDPOINT=${endpoint || 'http://127.0.0.1:8188'}`,
    `export IMAGE_MCP_LOCAL_MODEL=${model || 'comfyui-local'}`
  ]);
} else if (provider === 'drawthings') {
  print([
    'Start Draw Things and keep the local bridge available.',
    `export IMAGE_MCP_LOCAL_PROVIDER=drawthings`,
    `export IMAGE_MCP_LOCAL_ENDPOINT=${endpoint || 'http://127.0.0.1:8000/v1'}`,
    `export IMAGE_MCP_LOCAL_MODEL=${model || 'drawthings-local'}`
  ]);
} else {
  print([
    'Set IMAGE_MCP_LOCAL_ENDPOINT to the running local service.',
    `export IMAGE_MCP_LOCAL_PROVIDER=${provider}`,
    `export IMAGE_MCP_LOCAL_ENDPOINT=${endpoint || 'http://127.0.0.1:8000/v1'}`,
    `export IMAGE_MCP_LOCAL_MODEL=${model || 'local-model'}`
  ]);
}
