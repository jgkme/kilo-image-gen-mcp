#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import FormData from 'form-data';
import axios from 'axios';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const VERSION = '0.1.0';
const DEFAULT_MODEL = 'black-forest-labs/flux.2-pro';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_OUTPUT_DIR = './generated-images';
const DEFAULT_MODEL_BY_PROVIDER = {
  kilo: 'black-forest-labs/flux.2-pro',
  openrouter: 'google/gemini-2.5-flash-image',
  openai: 'gpt-5-image',
  gemini: 'gemini-3-pro-image-preview'
};
const PROVIDERS = ['kilo', 'openrouter', 'openai', 'gemini'];
const KNOWN_MODELS = {
  kilo: ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex'],
  openrouter: [
    'black-forest-labs/flux.2-pro',
    'black-forest-labs/flux.2-flex',
    'google/gemini-2.5-flash-image',
    'google/gemini-2.5-flash-image-preview',
    'google/gemini-3-pro-image-preview',
    'openai/gpt-5-image',
    'openai/gpt-5-image-mini',
    'sourceful/riverflow-v2-fast',
    'sourceful/riverflow-v2-pro',
    'sourceful/riverflow-v2.5-fast',
    'sourceful/riverflow-v2.5-pro',
    'recraft/recraft-v3'
  ],
  openai: ['gpt-5-image', 'gpt-5-image-mini'],
  gemini: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']
};

const EDIT_CAPABILITIES = {
  kilo: true,
  openrouter: true,
  openai: true,
  gemini: false
};

const server = new Server(
  { name: '@jgkme/kilo-image-gen-mcp', version: VERSION },
  { capabilities: { tools: {} } }
);

function configuredKey(name) {
  const value = env(name).trim();
  return value || undefined;
}

function providerKey(provider) {
  if (provider === 'kilo') return configuredKey('KILO_API_KEY');
  if (provider === 'openrouter') return configuredKey('OPENROUTER_API_KEY');
  if (provider === 'openai') return configuredKey('OPENAI_API_KEY');
  if (provider === 'gemini') return configuredKey('GEMINI_API_KEY');
  return undefined;
}

function providerKeyStatus(provider) {
  const value = providerKey(provider);
  if (!value) return { configured: false, length: 0 };
  return {
    configured: true,
    length: value.length,
    preview: `${value.slice(0, 4)}...${value.slice(-2)}`
  };
}

function requireProviderKey(provider) {
  const key = providerKey(provider);
  if (!key) {
    throw Object.assign(new Error(`${provider} API key is not configured`), {
      code: 'missing_api_key',
      retryable: false,
      details: { provider }
    });
  }
  return key;
}

function validateStartup() {
  const defaultProvider = providerFrom();
  const configuredProviders = PROVIDERS.filter((provider) => Boolean(providerKey(provider)));

  if (configuredProviders.length === 0) {
    throw Object.assign(new Error('At least one provider API key must be configured'), {
      code: 'missing_api_key',
      retryable: false,
      details: { provider: defaultProvider }
    });
  }
}

function env(name) {
  return process.env[name] || '';
}

function outputDir() {
  const configured = env('IMAGE_MCP_OUTPUT_DIR').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), DEFAULT_OUTPUT_DIR);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function ensureOutputDir() {
  return ensureDir(outputDir());
}

function mimeFromDataUrl(url) {
  const match = String(url || '').match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/i);
  if (!match) return { mimeType: 'image/png', base64: undefined };
  return { mimeType: match[1], base64: match[2] };
}

function normalizeBase64Payload(value) {
  if (!value || typeof value !== 'string') return undefined;
  if (value.startsWith('data:')) return mimeFromDataUrl(value).base64;
  return value;
}

function providerFrom(value) {
  const provider = String(value || env('IMAGE_MCP_DEFAULT_PROVIDER') || 'kilo').toLowerCase();
  return PROVIDERS.includes(provider) ? provider : 'kilo';
}

function defaultModel(provider) {
  const configured = env('IMAGE_MCP_DEFAULT_MODEL').trim();
  return configured || DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL;
}

function modelFor(provider, model) {
  if (model) return model;
  return defaultModel(provider);
}

function modalitiesForModel(provider, model, requestedModalities) {
  if (Array.isArray(requestedModalities) && requestedModalities.length) return requestedModalities;
  if (provider === 'openrouter') {
    const imageOnlyModels = ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex', 'sourceful/riverflow-v2-fast', 'sourceful/riverflow-v2-pro', 'sourceful/riverflow-v2.5-fast', 'sourceful/riverflow-v2.5-pro', 'recraft/recraft-v3'];
    if (imageOnlyModels.includes(model)) return ['image'];
    return ['image', 'text'];
  }
  return ['image', 'text'];
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
  const ext = path.extname(resolved).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function readImageBuffer(input) {
  if (!input) return undefined;
  if (input.startsWith('data:')) {
    const base64 = input.split(',').pop() || '';
    return Buffer.from(base64, 'base64');
  }
  if (/^https?:\/\//.test(input)) {
    const response = await axios.get(input, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }
  const resolved = path.resolve(input);
  return fs.readFile(resolved);
}

async function writeImage(outputPath, b64) {
  if (!outputPath) return undefined;
  const target = path.resolve(outputPath);
  await fs.writeFile(target, Buffer.from(b64, 'base64'));
  return target;
}

async function writeImageResult(result, outputPath) {
  if (!result?.data) return result;
  const baseDir = await ensureOutputDir();
  const target = outputPath ? path.resolve(outputPath) : path.join(baseDir, outputFileName('image'));
  await ensureDir(path.dirname(target));
  const decoded = result.data.startsWith('data:') ? mimeFromDataUrl(result.data) : { mimeType: result.mimeType || 'image/png', base64: result.data };
  await fs.writeFile(target, Buffer.from(decoded.base64, 'base64'));
  return { ...result, mimeType: decoded.mimeType, output_path: target };
}

function outputFileName(prefix = 'image') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.png`;
}

function imageTextResult(b64, outputPath) {
  return JSON.stringify({ type: 'image', data: b64, mimeType: 'image/png', output_path: outputPath || undefined }, null, 2);
}

function normalizeImagePart(part) {
  if (!part) return undefined;
  if (part.b64_json) return part.b64_json;
  if (part.type === 'output_image' && part.image_url?.url) return part.image_url.url.split(',').pop();
  if (typeof part === 'string') return part.startsWith('data:') ? part.split(',').pop() : part;
  if (part.image_url?.url) return part.image_url.url.split(',').pop();
  if (part.imageUrl?.url) return part.imageUrl.url.split(',').pop();
  if (part.url) return part.url.split(',').pop();
  if (part.data) return part.data;
  if (part.result) return normalizeBase64Payload(part.result);
  return undefined;
}

function collectImageParts(node, results = []) {
  if (!node) return results;
  if (Array.isArray(node)) {
    for (const entry of node) collectImageParts(entry, results);
    return results;
  }

  const candidates = [
    node,
    node.message,
    node.message?.content,
    node.message?.images,
    node.content,
    node.images,
    node.output,
    node.data,
    node.result
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      for (const part of candidate) {
        if (!part) continue;
        const url = part?.image_url?.url || part?.imageUrl?.url || part?.url;
        const data = normalizeBase64Payload(url) || normalizeBase64Payload(part?.data) || normalizeBase64Payload(part?.b64_json) || normalizeBase64Payload(part?.imageB64) || normalizeBase64Payload(part?.result);
        if (data) results.push({ data, mimeType: part?.mime_type || part?.mimeType || mimeFromDataUrl(url || part?.data || '').mimeType });
      }
      continue;
    }

    const url = candidate?.image_url?.url || candidate?.imageUrl?.url || candidate?.url;
    const data = normalizeBase64Payload(url) || normalizeBase64Payload(candidate?.data) || normalizeBase64Payload(candidate?.b64_json) || normalizeBase64Payload(candidate?.imageB64) || normalizeBase64Payload(candidate?.result);
    if (data) results.push({ data, mimeType: candidate?.mime_type || candidate?.mimeType || mimeFromDataUrl(url || candidate?.data || '').mimeType });
  }

  return results;
}

function extractImagePayload(response) {
  return collectImageParts(response)[0]?.data;
}

function extractImagePayloads(response) {
  return collectImageParts(response);
}

function validateArgs(args) {
  if (!args.prompt || typeof args.prompt !== 'string') {
    throw Object.assign(new Error('prompt is required'), { code: 'validation_error', retryable: false });
  }
  if (args.aspect && !['square', 'landscape', 'portrait'].includes(args.aspect)) {
    throw Object.assign(new Error('aspect must be square, landscape, or portrait'), { code: 'validation_error', retryable: false });
  }
  if (args.size && typeof args.size !== 'string') {
    throw Object.assign(new Error('size must be a string like 1024x1024'), { code: 'validation_error', retryable: false });
  }
  if (args.input_images && !Array.isArray(args.input_images)) {
    throw Object.assign(new Error('input_images must be an array of strings'), { code: 'validation_error', retryable: false });
  }
  if (args.modalities && !Array.isArray(args.modalities)) {
    throw Object.assign(new Error('modalities must be an array of strings'), { code: 'validation_error', retryable: false });
  }
  if (args.quality && typeof args.quality !== 'string') {
    throw Object.assign(new Error('quality must be a string'), { code: 'validation_error', retryable: false });
  }
  if (args.output_path && typeof args.output_path !== 'string') {
    throw Object.assign(new Error('output_path must be a string'), { code: 'validation_error', retryable: false });
  }
}

function errorResult(error) {
  return JSON.stringify(
    {
      code: error?.code || 'image_mcp_error',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || undefined,
      response: error?.response?.data || undefined,
      retryable: Boolean(error?.retryable)
    },
    null,
    2
  );
}

async function kiloImagesGenerations(args) {
  const prompt = promptWithAspect(args);
  const image = await readImageInput(args.input_image);
  const response = await axios.post(
    'https://api.kilo.ai/api/gateway/chat/completions',
    {
      model: modelFor('kilo', args.model),
      messages: [
        {
          role: 'user',
          content: image
            ? [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: image } }
              ]
            : [{ type: 'text', text: prompt }]
        }
      ],
      modalities: ['image', 'text']
    },
    {
      headers: {
        Authorization: `Bearer ${requireProviderKey('kilo')}`,
        'Content-Type': 'application/json',
        'X-KiloCode-EditorName': 'Kilo CLI'
      }
    }
  );

  const content = response?.data?.choices?.[0]?.message?.content;
  const parts = Array.isArray(content) ? content : content ? [content] : [];
  const imagePart = parts.find((part) => part?.type === 'image_url' || part?.type === 'image' || part?.image_url || part?.url || part?.b64_json || part?.data);
  const b64 = normalizeImagePart(imagePart);
  if (!b64) throw Object.assign(new Error('Kilo image response did not include an image payload'), { retryable: false, response: response?.data });
  const output_path = await writeImage(args.output_path, b64);
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function kiloImageEdits(args) {
  const { width, height } = dimensions(args);
  const image = await readImageInput(args.reference_image || args.input_image);
  const payload = {
    model: modelFor('kilo', args.model),
    prompt: promptWithAspect(args),
    width,
    height,
    ...(args.steps ? { steps: args.steps } : {}),
    input_image: image
  };
  const response = await axios.post(
    'https://api.kilo.ai/api/gateway/images/edits',
    payload,
    { headers: { Authorization: `Bearer ${requireProviderKey('kilo')}`, 'Content-Type': 'application/json' } }
  );

  const b64 = response?.data?.data?.[0]?.b64_json || response?.data?.data?.[0]?.image?.b64_json;
  if (!b64) throw Object.assign(new Error('Kilo edit response did not include image data'), { retryable: false, response: response?.data });
  const output_path = await writeImage(args.output_path, b64);
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function openaiImageEdits(args) {
  const image = await readImageBuffer(args.reference_image || args.input_image);
  const form = new FormData();
  form.append('model', modelFor('openai', args.model));
  form.append('prompt', promptWithAspect(args));
  form.append('image', image, { filename: 'input.png', contentType: 'image/png' });
  if (args.output_path) form.append('response_format', 'b64_json');
  if (args.size || args.width || args.height) form.append('size', `${dimensions(args).width}x${dimensions(args).height}`);

  const response = await axios.post('https://api.openai.com/v1/images/edits', form, {
    headers: { Authorization: `Bearer ${requireProviderKey('openai')}`, ...form.getHeaders() }
  });

  const b64 = response?.data?.data?.[0]?.b64_json || response?.data?.data?.[0]?.url?.split(',').pop();
  if (!b64) throw Object.assign(new Error('OpenAI edit response did not include image data'), { retryable: false, response: response?.data });
  const output_path = await writeImage(args.output_path, b64);
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function openrouterImageEdits(args) {
  const image = await readImageBuffer(args.reference_image || args.input_image);
  const form = new FormData();
  form.append('model', modelFor('openrouter', args.model));
  form.append('prompt', promptWithAspect(args));
  form.append('image', image, { filename: 'input.png', contentType: 'image/png' });
  if (args.size || args.width || args.height) form.append('size', `${dimensions(args).width}x${dimensions(args).height}`);

  const response = await axios.post('https://openrouter.ai/api/v1/images/edits', form, {
    headers: {
      Authorization: `Bearer ${requireProviderKey('openrouter')}`,
      'HTTP-Referer': 'https://github.com/jgkme/kilo-image-gen-mcp',
      'X-Title': '@jgkme/kilo-image-gen-mcp',
      ...form.getHeaders()
    }
  });

  const b64 = response?.data?.data?.[0]?.b64_json || response?.data?.data?.[0]?.url?.split(',').pop();
  if (!b64) throw Object.assign(new Error('OpenRouter edit response did not include image data'), { retryable: false, response: response?.data });
  const output_path = await writeImage(args.output_path, b64);
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function openrouterImagesGenerations(args) {
  const prompt = promptWithAspect(args);
  const image = await readImageInput(args.input_image);
  const imageConfig = {
    ...(args.aspect ? { aspect_ratio: args.aspect === 'square' ? '1:1' : args.aspect === 'landscape' ? '16:9' : '9:16' } : {}),
    ...(args.size && args.size.includes('x') ? { size: args.size } : {}),
    ...(args.quality ? { quality: args.quality } : {}),
    ...(args.background ? { background: args.background } : {}),
    ...(args.output_format ? { output_format: args.output_format } : {}),
    ...(args.moderation ? { moderation: args.moderation } : {})
  };

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: modelFor('openrouter', args.model),
      messages: [
        {
          role: 'user',
          content: image
            ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }]
            : [{ type: 'text', text: prompt }]
        }
      ],
      modalities: modalitiesForModel('openrouter', modelFor('openrouter', args.model), args.modalities),
      ...(Object.keys(imageConfig).length ? { image_config: imageConfig } : {}),
      ...(args.input_images?.length ? { input_images: args.input_images } : {}),
      ...(args.max_tokens ? { max_tokens: args.max_tokens } : {})
    },
    {
      headers: {
        Authorization: `Bearer ${requireProviderKey('openrouter')}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jgkme/kilo-image-gen-mcp',
        'X-Title': '@jgkme/kilo-image-gen-mcp'
      }
    }
  );

  const payloads = extractImagePayloads(response?.data);
  if (!payloads.length) {
    throw Object.assign(new Error('openrouter chat response did not include an image payload'), { retryable: false, response: response?.data });
  }

  const images = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    const saved = await writeImageResult({ type: 'image', data: payload.data, mimeType: payload.mimeType }, args.output_path ? args.output_path.replace(/\.png$/i, `-${index + 1}.png`) : undefined);
    images.push(saved);
  }

  return images.length === 1 ? images[0] : { type: 'images', images };
}

async function providerChatCompletion(provider, args) {
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
  const apiKey = requireProviderKey(provider);

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model: modelFor(provider, args.model),
      messages,
      modalities: ['image', 'text']
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/jgkme/kilo-image-gen-mcp', 'X-Title': '@jgkme/kilo-image-gen-mcp' } : {})
      }
    }
  );

  const payloads = extractImagePayloads(response?.data);
  if (!payloads.length) throw Object.assign(new Error(`${provider} chat response did not include an image payload`), { retryable: false, response: response?.data });
  const images = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    const saved = await writeImageResult({ type: 'image', data: payload.data, mimeType: payload.mimeType }, args.output_path ? args.output_path.replace(/\.png$/i, `-${index + 1}.png`) : undefined);
    images.push(saved);
  }
  return images.length === 1 ? images[0] : { type: 'images', images };
}

async function providerEditImage(provider, args) {
  return providerChatCompletion(provider, {
    ...args,
    input_image: args.reference_image || args.input_image,
    prompt: `${args.prompt}\n\nEdit the provided reference image while preserving the important subject and composition unless explicitly instructed otherwise.`
  });
}

async function generateImage(args) {
  const provider = providerFrom(args.provider);
  if (provider === 'kilo') return kiloImagesGenerations(args);
  if (provider === 'openrouter') return openrouterImagesGenerations(args);
  return providerChatCompletion(provider, args);
}

async function listImageModels() {
  return {
    defaults: { provider: providerFrom(), model: defaultModel(providerFrom()), size: DEFAULT_SIZE },
    providers: {
      kilo: { configured: Boolean(env('KILO_API_KEY')), endpoint: 'https://api.kilo.ai/api/gateway/images/generations', generate: true, edit: true },
      openrouter: { configured: Boolean(env('OPENROUTER_API_KEY')), endpoint: 'https://openrouter.ai/api/v1/chat/completions', generate: true, edit: true },
      openai: { configured: Boolean(env('OPENAI_API_KEY')), endpoint: 'https://api.openai.com/v1/chat/completions', generate: true, edit: true },
      gemini: { configured: Boolean(env('GEMINI_API_KEY')), endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', generate: true, edit: false }
    },
    models: KNOWN_MODELS,
    outputDir: outputDir(),
    openrouter: {
      imageGeneration: {
        modalities: ['image', 'text', 'image-only'],
        imageConfig: ['aspect_ratio', 'size', 'quality', 'background', 'output_format', 'moderation']
      }
    }
  };
}

async function editImage(args) {
  const provider = providerFrom(args.provider);
  if (provider === 'kilo' && EDIT_CAPABILITIES.kilo) return kiloImageEdits(args);
  if (provider === 'openai' && EDIT_CAPABILITIES.openai) return openaiImageEdits(args);
  if (provider === 'openrouter' && EDIT_CAPABILITIES.openrouter) return openrouterImageEdits(args);
  return providerChatCompletion(provider, {
    ...args,
    input_image: args.reference_image || args.input_image,
    prompt: `${args.prompt}\n\nEdit the provided reference image while preserving the important subject and composition unless explicitly instructed otherwise.`
  });
}

async function getProviderStatus() {
  return {
    version: VERSION,
    defaults: { provider: providerFrom(), model: defaultModel(providerFrom()), size: DEFAULT_SIZE },
    configured: Object.fromEntries(PROVIDERS.map((provider) => [provider, providerKeyStatus(provider)])),
    capabilities: {
      openrouter: {
        chat_image_generation: true,
        output_modalities: ['image', 'text'],
        response_shapes: ['choices[0].message.images', 'choices[0].message.content', 'data.output', 'data']
      }
    },
    runtime: {
      defaultProvider: env('IMAGE_MCP_DEFAULT_PROVIDER') || undefined,
      defaultModel: env('IMAGE_MCP_DEFAULT_MODEL') || undefined
    }
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
      name: 'generate_image',
      description: 'Generate images using the selected provider. OpenRouter requests default to chat-completions with modalities and response normalization, including multiple image payloads when present.',
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
          input_images: { type: 'array', items: { type: 'string' } },
          modalities: { type: 'array', items: { type: 'string' } },
          quality: { type: 'string' },
          background: { type: 'string' },
          output_format: { type: 'string' },
          moderation: { type: 'string' },
          max_tokens: { type: 'number' },
          output_path: { type: 'string' }
        },
        required: ['prompt']
      }
    },
    {
      name: 'list_image_models',
      description: 'List available providers, defaults, model families, and edit capability.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'get_provider_status',
      description: 'Report configured providers, defaults, and server version.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'edit_image',
      description: 'Edit an image using a reference image and prompt.',
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
          reference_image: { type: 'string' },
          output_path: { type: 'string' }
        },
        required: ['prompt', 'input_image']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    if (name === 'kilo_generate_image' || name === 'edit_image') validateArgs(args);
    if (name === 'generate_image') validateArgs(args);
    if (name === 'kilo_generate_image') {
      const result = await generateImage(args);
      return { content: [{ type: 'text', text: imageTextResult(result.data, result.output_path) }] };
    }
    if (name === 'generate_image') {
      const result = await generateImage(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'edit_image') {
      const result = await editImage(args);
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

try {
  validateStartup();
  process.stderr.write(`@jgkme/kilo-image-gen-mcp v${VERSION} starting\n`);
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`${errorResult(error)}\n`);
  process.exit(1);
}
