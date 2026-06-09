#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const VERSION = '0.1.0';
const DEFAULT_MODEL = 'black-forest-labs/flux.2-pro';
const DEFAULT_SIZE = '1024x1024';
const PROVIDERS = ['kilo', 'openrouter', 'openai', 'gemini'];

const server = new Server(
  { name: '@jgkme/kilo-image-gen-mcp', version: VERSION },
  { capabilities: { tools: {} } }
);

function env(name) {
  return process.env[name] || '';
}

function providerFrom(value) {
  const provider = String(value || env('IMAGE_MCP_DEFAULT_PROVIDER') || 'kilo').toLowerCase();
  return PROVIDERS.includes(provider) ? provider : 'kilo';
}

function modelFor(provider, model) {
  if (model) return model;
  if (provider === 'openrouter') return 'black-forest-labs/flux-2-pro';
  if (provider === 'openai') return 'gpt-5-image';
  if (provider === 'gemini') return 'gemini-3-pro-image-preview';
  return DEFAULT_MODEL;
}

function aspectToSize(aspect) {
  if (aspect === 'landscape') return { width: 1536, height: 864 };
  if (aspect === 'portrait') return { width: 864, height: 1536 };
  return { width: 1024, height: 1024 };
}

function dimensions(args = {}) {
  if (Number.isFinite(args.width) && Number.isFinite(args.height)) {
    return { width: args.width, height: args.height };
  }
  if (typeof args.size === 'string' && args.size.includes('x')) {
    const [width, height] = args.size.split('x').map(Number);
    if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };
  }
  if (args.aspect) return aspectToSize(args.aspect);
  return aspectToSize('square');
}

function promptWithAspect(args) {
  const segments = [];
  if (args.aspect) segments.push(`Aspect ratio: ${args.aspect}.`);
  if (args.steps) segments.push(`Generation steps: ${args.steps}.`);
  segments.push(args.prompt);
  return segments.join(' ').trim();
}

function base64Prefix(data) {
  return data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
}

async function readImageInput(input) {
  if (!input) return undefined;
  if (/^https?:\/\//.test(input) || input.startsWith('data:')) return input;
  const resolved = path.resolve(input);
  const buffer = await fs.readFile(resolved);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function writeImage(outputPath, b64) {
  if (!outputPath) return undefined;
  const target = path.resolve(outputPath);
  await fs.writeFile(target, Buffer.from(b64, 'base64'));
  return target;
}

function imageTextResult(b64, outputPath) {
  return JSON.stringify({ type: 'image', data: b64, mimeType: 'image/png', output_path: outputPath || undefined }, null, 2);
}

function errorResult(error) {
  return JSON.stringify(
    {
      code: error?.code || 'image_mcp_error',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || undefined,
      retryable: Boolean(error?.retryable)
    },
    null,
    2
  );
}

async function kiloImagesGenerations(args) {
  const { width, height } = dimensions(args);
  const input_image = await readImageInput(args.input_image);
  const response = await axios.post(
    'https://api.kilo.ai/api/gateway/images/generations',
    {
      model: modelFor('kilo', args.model),
      prompt: promptWithAspect(args),
      width,
      height,
      ...(args.steps ? { steps: args.steps } : {}),
      ...(input_image ? { input_image } : {})
    },
    { headers: { Authorization: `Bearer ${env('KILO_API_KEY')}`, 'Content-Type': 'application/json' } }
  );

  const b64 = response?.data?.data?.[0]?.b64_json;
  if (!b64) throw Object.assign(new Error('Kilo image response did not include data[0].b64_json'), { retryable: false });
  const output_path = await writeImage(args.output_path, b64);
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function providerChatCompletion(provider, args) {
  const { width, height } = dimensions(args);
  const prompt = promptWithAspect(args);
  const image = await readImageInput(args.input_image);
  const messages = [
    {
      role: 'user',
      content: image
        ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }]
        : [{ type: 'text', text: prompt }]
    }
  ];

  const baseURL =
    provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : provider === 'openai'
        ? 'https://api.openai.com/v1'
        : 'https://generativelanguage.googleapis.com/v1beta/openai';
  const apiKey = provider === 'openrouter' ? env('OPENROUTER_API_KEY') : provider === 'openai' ? env('OPENAI_API_KEY') : env('GEMINI_API_KEY');

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model: modelFor(provider, args.model),
      messages,
      modalities: ['image', 'text'],
      extra_body: { size: `${width}x${height}` }
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/jgkme/kilo-image-gen-mcp', 'X-Title': '@jgkme/kilo-image-gen-mcp' } : {})
      }
    }
  );

  const content = response?.data?.choices?.[0]?.message?.content;
  const parts = Array.isArray(content) ? content : content ? [content] : [];
  const imagePart = parts.find((part) => part?.type === 'image_url' || part?.type === 'image' || part?.image_url || part?.url || part?.b64_json);
  const b64 = imagePart?.b64_json || imagePart?.image_url?.url?.split(',').pop() || imagePart?.url?.split(',').pop();
  if (!b64) throw Object.assign(new Error(`${provider} chat response did not include an image payload`), { retryable: false });
  const output_path = await writeImage(args.output_path, b64);
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function generateImage(args) {
  const provider = providerFrom(args.provider);
  if (provider === 'kilo') return kiloImagesGenerations(args);
  return providerChatCompletion(provider, args);
}

async function listImageModels() {
  return {
    defaults: { provider: providerFrom(), model: DEFAULT_MODEL, size: DEFAULT_SIZE },
    providers: {
      kilo: { configured: Boolean(env('KILO_API_KEY')), endpoint: 'https://api.kilo.ai/api/gateway/images/generations' },
      openrouter: { configured: Boolean(env('OPENROUTER_API_KEY')), endpoint: 'https://openrouter.ai/api/v1/chat/completions' },
      openai: { configured: Boolean(env('OPENAI_API_KEY')), endpoint: 'https://api.openai.com/v1/chat/completions' },
      gemini: { configured: Boolean(env('GEMINI_API_KEY')), endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' }
    },
    models: {
      kilo: ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex'],
      openrouter: ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex'],
      openai: ['gpt-5-image', 'gpt-5-image-mini'],
      gemini: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']
    }
  };
}

async function getProviderStatus() {
  return {
    defaults: { provider: providerFrom(), model: DEFAULT_MODEL, size: DEFAULT_SIZE },
    configured: Object.fromEntries(PROVIDERS.map((provider) => [provider, Boolean(env(`${provider.toUpperCase()}_API_KEY`))]))
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'kilo_generate_image',
      description:
        'Generate an image using Kilo Gateway or a configured provider. Choose a provider by intent: default/general to black-forest-labs/flux.2-pro, fast drafts to black-forest-labs/flux.2-flex, in-image text to gpt-5-image, highest-fidelity grounding to gemini-3-pro-image-preview. Provide subject, style, colors, mood, context, aspect ratio, transparency, and optional reference image.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          provider: { type: 'string', enum: PROVIDERS },
          model: { type: 'string' },
          size: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
          aspect: { type: 'string', enum: ['square', 'landscape', 'portrait'] },
          steps: { type: 'number' },
          input_image: { type: 'string' },
          output_path: { type: 'string' }
        },
        required: ['prompt']
      }
    },
    {
      name: 'list_image_models',
      description: 'List available providers, defaults, and model families.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'get_provider_status',
      description: 'Report configured providers and defaults.',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    if (name === 'kilo_generate_image') {
      const result = await generateImage(args);
      return { content: [{ type: 'text', text: imageTextResult(result.data, result.output_path) }] };
    }
    if (name === 'list_image_models') {
      return { content: [{ type: 'text', text: JSON.stringify(await listImageModels(), null, 2) }] };
    }
    if (name === 'get_provider_status') {
      return { content: [{ type: 'text', text: JSON.stringify(await getProviderStatus(), null, 2) }] };
    }
    throw Object.assign(new Error(`Unknown tool: ${name}`), { retryable: false });
  } catch (error) {
    return { content: [{ type: 'text', text: errorResult(error) }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
