#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import FormData from 'form-data';
import axios from 'axios';
import sharp from 'sharp';
import { rmbg, createBriaaiModel, createModnetModel, createU2netpModel } from 'rmbg';
import removeBackground from '@imgly/background-removal-node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const VERSION = '0.5.0';
const DEFAULT_MODEL = 'black-forest-labs/flux.2-pro';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_OUTPUT_DIR = './generated-images';
const PROJECT_OUTPUT_HINT_FILES = ['.image-mcp-output', '.image-mcp-output.json', '.kilo-image-output'];
const DEFAULT_MODEL_BY_PROVIDER = {
  kilo: 'black-forest-labs/flux.2-pro',
  openrouter: 'google/gemini-2.5-flash-image',
  openai: 'gpt-image-1',
  gemini: 'gemini-2.5-flash-image'
};
const BACKGROUND_REMOVE_BACKENDS = ['rmbg', 'imgly'];
const BACKGROUND_REMOVE_MODELS = ['u2netp', 'modnet', 'briaai'];
const IMGLY_BACKGROUND_REMOVE_MODELS = ['small', 'medium'];
const PROVIDERS = ['kilo', 'openrouter', 'openai', 'gemini'];
const KNOWN_MODELS = {
  kilo: ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex'],
  openrouter: [
    'black-forest-labs/flux.2-pro',
    'black-forest-labs/flux.2-flex',
    'google/gemini-2.5-flash-image',
    'google/gemini-2.5-flash-image-preview',
    'google/gemini-3-pro-image-preview',
    'openai/gpt-image-1',
    'sourceful/riverflow-v2-fast',
    'sourceful/riverflow-v2-pro',
    'sourceful/riverflow-v2.5-fast',
    'sourceful/riverflow-v2.5-pro',
    'recraft/recraft-v3'
  ],
  openai: ['gpt-image-1'],
  gemini: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']
};

const EDIT_CAPABILITIES = {
  kilo: true,
  openrouter: true,
  openai: true,
  gemini: false
};

const PROCESSING_FITS = ['cover', 'contain', 'fill', 'inside', 'outside'];

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
    process.stderr.write(
      JSON.stringify(
        {
          code: 'missing_api_key',
          message: 'No provider API key is visible at startup; provider-specific tools will fail until one is injected.',
          details: { provider: defaultProvider },
          retryable: false
        },
        null,
        2
      ) + '\n'
    );
  }
}

function env(name) {
  return process.env[name] || '';
}

function debugMode() {
  return ['1', 'true', 'yes', 'on'].includes(env('IMAGE_MCP_DEBUG').toLowerCase());
}

let _cachedHintedOutputDir = null;

async function resolveOutputDirHint() {
  _cachedHintedOutputDir = await projectOutputDirFromHint();
}

function outputDir() {
  if (_cachedHintedOutputDir) return _cachedHintedOutputDir;
  const configured = env('IMAGE_MCP_OUTPUT_DIR').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), DEFAULT_OUTPUT_DIR);
}

async function readFirstExistingFile(paths) {
  for (const candidate of paths) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // ignore missing hint files
    }
  }
  return undefined;
}

async function projectOutputDirFromHint() {
  const explicit = env('IMAGE_MCP_PROJECT_OUTPUT_DIR').trim();
  if (explicit) return path.resolve(explicit);

  const raw = await readFirstExistingFile(PROJECT_OUTPUT_HINT_FILES.map((hint) => path.resolve(process.cwd(), hint)));
  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.outputDir === 'string' && parsed.outputDir.trim()) {
        return path.resolve(parsed.outputDir.trim());
      }
      if (parsed && typeof parsed.output_path === 'string' && parsed.output_path.trim()) {
        return path.resolve(parsed.output_path.trim());
      }
    } catch {
      return undefined;
    }
  }

  return path.resolve(trimmed);
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

function imageModelFor(provider, args = {}) {
  if (args.model) return args.model;
  if (provider === 'gemini') {
    const quality = String(args.quality || '').toLowerCase();
    if (quality === 'quality') return 'gemini-3-pro-image-preview';
    if (quality === 'balanced') return 'gemini-3.1-flash-image-preview';
    return 'gemini-2.5-flash-image';
  }
  if (provider === 'openrouter') {
    const quality = String(args.quality || '').toLowerCase();
    if (quality === 'quality') return 'google/gemini-3-pro-image-preview';
    if (quality === 'balanced') return 'google/gemini-3.1-flash-image-preview';
    return 'google/gemini-2.5-flash-image';
  }
  if (provider === 'openai') return 'gpt-image-1';
  return defaultModel(provider);
}

function normalizedQuality(args = {}) {
  const preset = String(args.quality || '').toLowerCase();
  if (['fast', 'balanced', 'quality'].includes(preset)) return preset;
  return undefined;
}

function providerQuality(provider, args = {}) {
  const quality = normalizedQuality(args);
  if (!quality) return undefined;
  if (provider === 'openai' || provider === 'openrouter') {
    return quality === 'fast' ? 'low' : quality === 'balanced' ? 'medium' : 'high';
  }
  return quality;
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
  if (args.purpose) segments.push(`Purpose: ${args.purpose}.`);
  if (args.aspect) segments.push(`Aspect ratio: ${args.aspect}.`);
  if (args.quality) segments.push(`Quality target: ${args.quality}.`);
  if (args.style) segments.push(`Style: ${args.style}.`);
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

function normalizeOutputPath(outputPath, fallbackPrefix) {
  if (outputPath && typeof outputPath === 'string' && outputPath.trim()) {
    return path.resolve(process.cwd(), outputPath);
  }
  return path.join(process.cwd(), DEFAULT_OUTPUT_DIR, outputFileName(fallbackPrefix));
}

async function writeImageResult(result, outputPath) {
  if (!result?.data) return result;
  const baseDir = await ensureOutputDir();
  const target = outputPath ? normalizeOutputPath(outputPath, 'image') : path.join(baseDir, outputFileName('image'));
  await ensureDir(path.dirname(target));
  const decoded = result.data.startsWith('data:') ? mimeFromDataUrl(result.data) : { mimeType: result.mimeType || 'image/png', base64: result.data };
  await fs.writeFile(target, Buffer.from(decoded.base64, 'base64'));
  return { ...result, mimeType: decoded.mimeType, output_path: target, bytes: Buffer.byteLength(decoded.base64, 'base64') };
}

function uniqueOutputPath(outputPath, suffix) {
  if (!outputPath) return undefined;
  const resolved = normalizeOutputPath(outputPath, 'image');
  const ext = path.extname(resolved);
  const base = resolved.slice(0, resolved.length - ext.length);
  return `${base}${suffix}${ext || '.png'}`;
}

function outputFileName(prefix = 'image') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.png`;
}

function imageTextResult(b64, outputPath) {
  return JSON.stringify({ type: 'image', data: b64, mimeType: 'image/png', output_path: outputPath || undefined }, null, 2);
}

function imageToolContent(result) {
  const mimeType = result.mimeType || 'image/png';
  const lines = ['### Image saved', `- Path: \`${result.output_path || 'not saved to disk'}\``, `- MIME type: \`${mimeType}\``];
  if (Number.isFinite(result.bytes)) lines.push(`- Size: \`${result.bytes} bytes\``);
  if (result.provider) lines.push(`- Provider: \`${result.provider}\``);
  if (result.model) lines.push(`- Model: \`${result.model}\``);
  if (result.backend) lines.push(`- Backend: \`${result.backend}\``);
  if (result.action) lines.push(`- Action: \`${result.action}\``);
  if (debugMode() && result.response) {
    const responseText = typeof result.response === 'string' ? result.response : JSON.stringify(result.response).slice(0, 500);
    lines.push(`- Response: \`${responseText}\``);
  }
  const content = [
    {
      type: 'resource_link',
      name: path.basename(result.output_path || 'image.png'),
      uri: pathToFileURL(result.output_path || path.resolve(process.cwd(), 'generated-images', 'image.png')).href,
      mimeType
    }
  ];
  content.push({
    type: 'text',
    text: lines.join('\n')
  });
  return content;
}

function defaultSavedImagePath(prefix = 'image') {
  return path.join(outputDir(), outputFileName(prefix));
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
    node.choices?.[0]?.message?.images,
    node.choices?.[0]?.message?.content,
    node.choices?.[0]?.message,
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
        if (typeof part === 'string') {
          const stringPayload = normalizeBase64Payload(part);
          if (stringPayload) results.push({ data: stringPayload, mimeType: mimeFromDataUrl(part).mimeType });
          continue;
        }
        const url = part?.image_url?.url || part?.imageUrl?.url || part?.url;
        const data = normalizeBase64Payload(url) || normalizeBase64Payload(part?.data) || normalizeBase64Payload(part?.b64_json) || normalizeBase64Payload(part?.imageB64) || normalizeBase64Payload(part?.result) || normalizeBase64Payload(part?.imageUrl?.url);
        if (data) results.push({ data, mimeType: part?.mime_type || part?.mimeType || mimeFromDataUrl(url || part?.data || '').mimeType });
      }
      continue;
    }

    if (typeof candidate === 'string') {
      const stringPayload = normalizeBase64Payload(candidate);
      if (stringPayload) {
        results.push({ data: stringPayload, mimeType: mimeFromDataUrl(candidate).mimeType });
      }
      continue;
    }

    const url = candidate?.image_url?.url || candidate?.imageUrl?.url || candidate?.url;
    const data = normalizeBase64Payload(url) || normalizeBase64Payload(candidate?.data) || normalizeBase64Payload(candidate?.b64_json) || normalizeBase64Payload(candidate?.imageB64) || normalizeBase64Payload(candidate?.result) || normalizeBase64Payload(candidate?.imageUrl?.url);
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
  if (args.reference_image && typeof args.reference_image !== 'string') {
    throw Object.assign(new Error('reference_image must be a string'), { code: 'validation_error', retryable: false });
  }
  if (args.input_image && typeof args.input_image !== 'string') {
    throw Object.assign(new Error('input_image must be a string'), { code: 'validation_error', retryable: false });
  }
}

function validateProcessingArgs(args) {
  if (!args.input_image || typeof args.input_image !== 'string') {
    throw Object.assign(new Error('input_image is required'), { code: 'validation_error', retryable: false });
  }
  if (args.output_path && typeof args.output_path !== 'string') {
    throw Object.assign(new Error('output_path must be a string'), { code: 'validation_error', retryable: false });
  }
  if (args.width !== undefined && !Number.isFinite(args.width)) {
    throw Object.assign(new Error('width must be a number'), { code: 'validation_error', retryable: false });
  }
  if (args.height !== undefined && !Number.isFinite(args.height)) {
    throw Object.assign(new Error('height must be a number'), { code: 'validation_error', retryable: false });
  }
  if (args.fit && !PROCESSING_FITS.includes(args.fit)) {
    throw Object.assign(new Error(`fit must be one of ${PROCESSING_FITS.join(', ')}`), { code: 'validation_error', retryable: false });
  }
  if (args.backend && typeof args.backend !== 'string') {
    throw Object.assign(new Error(`backend must be one of ${BACKGROUND_REMOVE_BACKENDS.join(', ')}`), { code: 'validation_error', retryable: false });
  }
  const backend = String(args.backend || 'rmbg').toLowerCase();
  if (args.model && typeof args.model !== 'string') {
    throw Object.assign(new Error('model must be a string'), { code: 'validation_error', retryable: false });
  }
  if (backend === 'rmbg' && args.model && !BACKGROUND_REMOVE_MODELS.includes(String(args.model).toLowerCase())) {
    throw Object.assign(new Error(`model must be one of ${BACKGROUND_REMOVE_MODELS.join(', ')}`), { code: 'validation_error', retryable: false });
  }
  if (backend === 'imgly' && args.model && !IMGLY_BACKGROUND_REMOVE_MODELS.includes(String(args.model).toLowerCase())) {
    throw Object.assign(new Error(`model must be one of ${IMGLY_BACKGROUND_REMOVE_MODELS.join(', ')}`), { code: 'validation_error', retryable: false });
  }
  if (args.max_resolution !== undefined && !Number.isFinite(args.max_resolution)) {
    throw Object.assign(new Error('max_resolution must be a number'), { code: 'validation_error', retryable: false });
  }
  if (args.max_resolution !== undefined && args.max_resolution <= 0) {
    throw Object.assign(new Error('max_resolution must be greater than 0'), { code: 'validation_error', retryable: false });
  }
}

function errorResult(error) {
  const payload = {
    code: error?.code || 'image_mcp_error',
    message: error instanceof Error ? error.message : String(error),
    retryable: Boolean(error?.retryable)
  };
  if (debugMode()) {
    payload.details = error?.details || undefined;
    payload.response = error?.response?.data || error?.response || undefined;
    payload.stack = error instanceof Error ? error.stack : undefined;
  }
  return JSON.stringify(payload, null, 2);
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
  const output_path = args.output_path ? await writeImage(args.output_path, b64) : undefined;
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
  const output_path = args.output_path ? await writeImage(args.output_path, b64) : undefined;
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function openaiImageEdits(args) {
  const image = await readImageBuffer(args.reference_image || args.input_image);
  const form = new FormData();
  form.append('model', imageModelFor('openai', args));
  form.append('prompt', promptWithAspect(args));
  form.append('image', image, { filename: 'input.png', contentType: 'image/png' });
  if (args.output_path) form.append('response_format', 'b64_json');
  if (args.size || args.width || args.height) form.append('size', `${dimensions(args).width}x${dimensions(args).height}`);
  if (providerQuality('openai', args)) form.append('quality', providerQuality('openai', args));

  const response = await axios.post('https://api.openai.com/v1/images/edits', form, {
    headers: { Authorization: `Bearer ${requireProviderKey('openai')}`, ...form.getHeaders() }
  });

  const b64 = response?.data?.data?.[0]?.b64_json || response?.data?.data?.[0]?.url?.split(',').pop();
  if (!b64) throw Object.assign(new Error('OpenAI edit response did not include image data'), { retryable: false, response: response?.data });
  const output_path = args.output_path ? await writeImage(args.output_path, b64) : undefined;
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function openrouterImageEdits(args) {
  const image = await readImageBuffer(args.reference_image || args.input_image);
  const form = new FormData();
  form.append('model', imageModelFor('openrouter', args));
  form.append('prompt', promptWithAspect(args));
  form.append('image', image, { filename: 'input.png', contentType: 'image/png' });
  if (args.size || args.width || args.height) form.append('size', `${dimensions(args).width}x${dimensions(args).height}`);
  if (providerQuality('openrouter', args)) form.append('quality', providerQuality('openrouter', args));

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
  const output_path = args.output_path ? await writeImage(args.output_path, b64) : undefined;
  return { type: 'image', data: b64, mimeType: 'image/png', output_path };
}

async function openrouterImagesGenerations(args) {
  const prompt = promptWithAspect(args);
  const image = await readImageInput(args.input_image);
  const imageConfig = {
    ...(args.aspect ? { aspect_ratio: args.aspect === 'square' ? '1:1' : args.aspect === 'landscape' ? '16:9' : '9:16' } : {}),
    ...(args.size && args.size.includes('x') ? { size: args.size } : {}),
    ...(providerQuality('openrouter', args) ? { quality: providerQuality('openrouter', args) } : {}),
    ...(args.background ? { background: args.background } : {}),
    ...(args.output_format ? { output_format: args.output_format } : {}),
    ...(args.moderation ? { moderation: args.moderation } : {})
  };

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: imageModelFor('openrouter', args),
      messages: [
        {
          role: 'user',
          content: image
            ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }]
            : [{ type: 'text', text: prompt }]
        }
      ],
      modalities: modalitiesForModel('openrouter', imageModelFor('openrouter', args), args.modalities),
      ...(Object.keys(imageConfig).length ? { image_config: imageConfig } : {}),
      ...(args.input_images?.length ? { input_images: args.input_images } : {}),
      ...(image ? {} : { input_images: [] }),
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
    const image = { type: 'image', data: payload.data, mimeType: payload.mimeType };
    if (args.output_path) {
      images.push(await writeImageResult(image, index === 0 ? args.output_path : `${args.output_path.replace(/\.png$/i, '')}-${index + 1}.png`));
    } else {
      images.push(await writeImageResult(image, defaultSavedImagePath(`openrouter-${index + 1}`)));
    }
  }

  return images.length === 1 ? images[0] : { type: 'images', images };
}

async function openaiImageGenerations(args) {
  const image = await readImageInput(args.input_image);
  const prompt = promptWithAspect(args);
  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: imageModelFor('openai', args),
      prompt,
      size: args.size || '1024x1024',
      ...(providerQuality('openai', args) ? { quality: providerQuality('openai', args) } : {}),
      ...(args.output_format ? { response_format: 'b64_json' } : {}),
      ...(image ? { input_image: image } : {})
    },
    {
      headers: {
        Authorization: `Bearer ${requireProviderKey('openai')}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const payloads = extractImagePayloads(response?.data);
  if (!payloads.length) throw Object.assign(new Error('OpenAI image response did not include an image payload'), { retryable: false, response: response?.data });

  const images = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    const image = { type: 'image', data: payload.data, mimeType: payload.mimeType };
    if (args.output_path) {
      images.push(await writeImageResult(image, index === 0 ? args.output_path : uniqueOutputPath(args.output_path, `-${index + 1}`)));
    } else {
      images.push(await writeImageResult(image, defaultSavedImagePath(`openai-${index + 1}`)));
    }
  }

  return images.length === 1 ? images[0] : { type: 'images', images };
}

async function geminiImageGenerations(args) {
  const image = await readImageInput(args.input_image);
  const prompt = promptWithAspect(args);
  const response = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      model: imageModelFor('gemini', args),
      messages: [
        {
          role: 'user',
          content: image
            ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }]
            : [{ type: 'text', text: prompt }]
        }
      ],
      modalities: modalitiesForModel('gemini', imageModelFor('gemini', args), args.modalities),
      ...(args.max_tokens ? { max_tokens: args.max_tokens } : {})
    },
    {
      headers: {
        Authorization: `Bearer ${requireProviderKey('gemini')}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const payloads = extractImagePayloads(response?.data);
  if (!payloads.length) throw Object.assign(new Error('Gemini image response did not include an image payload'), { retryable: false, response: response?.data });

  const images = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    const image = { type: 'image', data: payload.data, mimeType: payload.mimeType };
    if (args.output_path) {
      images.push(await writeImageResult(image, index === 0 ? args.output_path : uniqueOutputPath(args.output_path, `-${index + 1}`)));
    } else {
      images.push(await writeImageResult(image, defaultSavedImagePath(`gemini-${index + 1}`)));
    }
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
      model: imageModelFor(provider, args),
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
    const image = { type: 'image', data: payload.data, mimeType: payload.mimeType };
    if (args.output_path) {
      images.push(await writeImageResult(image, index === 0 ? args.output_path : `${args.output_path.replace(/\.png$/i, '')}-${index + 1}.png`));
    } else {
      images.push(await writeImageResult(image, defaultSavedImagePath(`chat-${index + 1}`)));
    }
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

async function loadSharpInput(input) {
  const buffer = await readImageBuffer(input);
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  return { image, metadata };
}

async function saveSharpResult(image, outputPath, fallbackPrefix) {
  const baseDir = await ensureOutputDir();
  const target = outputPath ? normalizeOutputPath(outputPath, fallbackPrefix) : path.join(baseDir, outputFileName(fallbackPrefix));
  await ensureDir(path.dirname(target));
  const buffer = await image.png().toBuffer();
  await fs.writeFile(target, buffer);
  return target;
}

async function saveBufferResult(buffer, outputPath, fallbackPrefix) {
  const baseDir = await ensureOutputDir();
  const target = outputPath ? normalizeOutputPath(outputPath, fallbackPrefix) : path.join(baseDir, outputFileName(fallbackPrefix));
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, buffer);
  return target;
}

async function removeBackgroundBuffer(args) {
  const backend = String(args.backend || 'rmbg').toLowerCase();
  const modelName = String(args.model || (backend === 'imgly' ? 'medium' : 'modnet')).toLowerCase();
  const input =
    backend === 'imgly'
      ? /^https?:\/\//.test(args.input_image) || args.input_image.startsWith('data:')
        ? args.input_image
        : path.resolve(args.input_image)
      : await readImageBuffer(args.input_image);

  if (backend === 'imgly') {
    const blob = await removeBackground(input, {
      model: modelName === 'small' ? 'small' : 'medium',
      debug: debugMode(),
      output: {
        format: 'image/png',
        type: 'foreground',
        quality: 0.8
      }
    });
    const buffer = Buffer.from(await blob.arrayBuffer());
    return { buffer, backend, model: modelName === 'small' ? 'small' : 'medium' };
  }

  const model = modelName === 'briaai' ? createBriaaiModel() : modelName === 'u2netp' ? createU2netpModel() : createModnetModel();
  const buffer = await rmbg(input, {
    model,
    maxResolution: Math.max(1, Number(args.max_resolution) || 2048),
    cacheDir: path.join(process.cwd(), '.cache', 'rmbg'),
    enableCache: true
  });
  return { buffer, backend, model: modelName === 'briaai' ? 'briaai' : modelName === 'u2netp' ? 'u2netp' : 'modnet' };
}

async function resizeImage(args) {
  const { image } = await loadSharpInput(args.input_image);
  const { width, height } = dimensions(args);
  let pipeline = image.resize({
    width,
    height,
    fit: args.fit || 'inside',
    withoutEnlargement: true
  });
  if (args.background) pipeline = pipeline.flatten({ background: args.background });
  const output_path = await saveSharpResult(pipeline, args.output_path, 'resize');
  return { type: 'image', data: (await fs.readFile(output_path)).toString('base64'), mimeType: 'image/png', output_path };
}

async function autoCropImage(args) {
  const { image, metadata } = await loadSharpInput(args.input_image);
  const width = args.width || metadata.width;
  const height = args.height || metadata.height;
  let pipeline = image;
  if (width && height) {
    pipeline = pipeline.resize(width, height, { fit: 'cover', position: args.gravity || 'centre' });
  } else {
    pipeline = pipeline.trim();
  }
  const output_path = await saveSharpResult(pipeline, args.output_path, 'crop');
  return { type: 'image', data: (await fs.readFile(output_path)).toString('base64'), mimeType: 'image/png', output_path };
}

async function backgroundRemoveImage(args) {
  const { buffer: outputBuffer, backend, model } = await removeBackgroundBuffer(args);
  const output_path = await saveBufferResult(outputBuffer, args.output_path, 'background-remove');
  return {
    type: 'image',
    data: outputBuffer.toString('base64'),
    mimeType: 'image/png',
    output_path,
    bytes: outputBuffer.length,
    backend,
    model,
    action: 'background_remove'
  };
}

async function finalizeImage(args) {
  let inputBuffer = await readImageBuffer(args.input_image);
  let backgroundInfo;

  if (args.remove_background) {
    backgroundInfo = await removeBackgroundBuffer({
      input_image: args.input_image,
      backend: args.background_backend,
      model: args.background_model,
      max_resolution: args.max_resolution
    });
    inputBuffer = backgroundInfo.buffer;
  }

  const image = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  let pipeline = image;

  if (Number.isFinite(args.width) && Number.isFinite(args.height)) {
    pipeline = pipeline.resize({
      width: args.width,
      height: args.height,
      fit: args.fit || 'cover',
      position: args.gravity || 'centre',
      withoutEnlargement: false
    });
  } else if (args.trim) {
    pipeline = pipeline.trim();
  }

  if (args.background) {
    pipeline = pipeline.flatten({ background: args.background });
  }

  const output_path = await saveSharpResult(pipeline, args.output_path, 'finalize');
  const outputBuffer = await fs.readFile(output_path);
  const outputMetadata = await sharp(outputBuffer, { failOn: 'none' }).metadata();
  return {
    type: 'image',
    data: outputBuffer.toString('base64'),
    mimeType: 'image/png',
    output_path,
    bytes: outputBuffer.length,
    width: outputMetadata.width || metadata.width,
    height: outputMetadata.height || metadata.height,
    backend: backgroundInfo?.backend,
    model: backgroundInfo?.model,
    action: 'finalize_image'
  };
}

async function generateImage(args) {
  const provider = providerFrom(args.provider);
  if (provider === 'kilo') return kiloImagesGenerations(args);
  if (provider === 'openrouter') return openrouterImagesGenerations(args);
  if (provider === 'openai') return openaiImageGenerations(args);
  if (provider === 'gemini') return geminiImageGenerations(args);
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
      defaultModel: env('IMAGE_MCP_DEFAULT_MODEL') || undefined,
      outputDir: outputDir()
    }
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'kilo_generate_image',
      description:
        'Generate an image using Kilo Gateway or a configured provider. Choose a provider by intent: default/general to black-forest-labs/flux.2-pro, fast drafts to black-forest-labs/flux.2-flex, OpenAI uses gpt-image-1, Gemini defaults to gemini-2.5-flash-image and also supports gemini-3.1-flash-image-preview and gemini-3-pro-image-preview. Provide subject, style, colors, mood, context, aspect ratio, transparency, and optional reference image.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          provider: { type: 'string', enum: PROVIDERS },
          model: { type: 'string' },
          quality: { type: 'string' },
          purpose: { type: 'string' },
          style: { type: 'string' },
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
          purpose: { type: 'string' },
          style: { type: 'string' },
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
          quality: { type: 'string' },
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
    },
    {
      name: 'background_remove',
      description: 'Remove the background from an image with a local segmentation model and preserve transparency in the PNG output.',
      inputSchema: {
        type: 'object',
        properties: {
          input_image: { type: 'string' },
          backend: { type: 'string', enum: BACKGROUND_REMOVE_BACKENDS },
          model: { type: 'string' },
          max_resolution: { type: 'number' },
          output_path: { type: 'string' }
        },
        required: ['input_image']
      }
    },
    {
      name: 'finalize_image',
      description: 'Finalize an image locally by optionally removing the background and then cropping, trimming, resizing, and saving a PNG.',
      inputSchema: {
        type: 'object',
        properties: {
          input_image: { type: 'string' },
          remove_background: { type: 'boolean' },
          background_backend: { type: 'string', enum: BACKGROUND_REMOVE_BACKENDS },
          background_model: { type: 'string' },
          max_resolution: { type: 'number' },
          trim: { type: 'boolean' },
          width: { type: 'number' },
          height: { type: 'number' },
          fit: { type: 'string', enum: PROCESSING_FITS },
          gravity: { type: 'string' },
          background: { type: 'string' },
          output_path: { type: 'string' }
        },
        required: ['input_image']
      }
    },
    {
      name: 'resize_image',
      description: 'Resize an image locally with aspect-ratio-preserving defaults and PNG output.',
      inputSchema: {
        type: 'object',
        properties: {
          input_image: { type: 'string' },
          output_path: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
          fit: { type: 'string', enum: PROCESSING_FITS },
          background: { type: 'string' }
        },
        required: ['input_image']
      }
    },
    {
      name: 'auto_crop',
      description: 'Crop an image locally to a target aspect or requested dimensions.',
      inputSchema: {
        type: 'object',
        properties: {
          input_image: { type: 'string' },
          output_path: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
          gravity: { type: 'string' }
        },
        required: ['input_image']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    if (name === 'kilo_generate_image' || name === 'edit_image') validateArgs(args);
    if (name === 'generate_image') validateArgs(args);
    if (name === 'background_remove' || name === 'resize_image' || name === 'auto_crop') validateProcessingArgs(args);
    if (name === 'finalize_image') validateProcessingArgs({ ...args, backend: args.background_backend, model: args.background_model });
    if (name === 'kilo_generate_image') {
      const result = await generateImage(args);
      return { content: imageToolContent(result) };
    }
    if (name === 'generate_image') {
      const result = await generateImage(args);
      return { content: imageToolContent(result) };
    }
    if (name === 'edit_image') {
      const result = await editImage(args);
      return { content: imageToolContent(result) };
    }
    if (name === 'background_remove') {
      const result = await backgroundRemoveImage(args);
      return { content: imageToolContent(result) };
    }
    if (name === 'finalize_image') {
      const result = await finalizeImage(args);
      return { content: imageToolContent(result) };
    }
    if (name === 'resize_image') {
      const result = await resizeImage(args);
      return { content: imageToolContent(result) };
    }
    if (name === 'auto_crop') {
      const result = await autoCropImage(args);
      return { content: imageToolContent(result) };
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
  await resolveOutputDirHint();
  validateStartup();
  process.stderr.write(`@jgkme/kilo-image-gen-mcp v${VERSION} starting\n`);
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`${errorResult(error)}\n`);
  process.exit(1);
}
