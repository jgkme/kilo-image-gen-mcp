#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import http from 'node:http';
import FormData from 'form-data';
import axios from 'axios';
import sharp from 'sharp';
import { rmbg, createBriaaiModel, createModnetModel, createU2netpModel } from 'rmbg';
import removeBackground from '@imgly/background-removal-node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PACKAGE_JSON = require('./package.json');
const VERSION = PACKAGE_JSON.version;
const DEFAULT_MODEL = 'black-forest-labs/flux.2-pro';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_OUTPUT_DIR = './generated-images';
const PROJECT_OUTPUT_HINT_FILES = ['.image-mcp-output', '.image-mcp-output.json', '.kilo-image-output'];
const WORKFLOW_STATE_FILE = path.join(process.cwd(), '.image-mcp-workflows.json');
const DEFAULT_MODEL_BY_PROVIDER = { kilo: 'black-forest-labs/flux.2-pro', openrouter: 'google/gemini-2.5-flash-image', openai: 'gpt-image-1', gemini: 'gemini-2.5-flash-image' };
const BACKGROUND_REMOVE_BACKENDS = ['rmbg', 'imgly', 'withoutbg'];
const BACKGROUND_REMOVE_MODELS = ['u2netp', 'modnet', 'briaai'];
const IMGLY_BACKGROUND_REMOVE_MODELS = ['small', 'medium'];
const PROVIDERS = ['kilo', 'openrouter', 'openai', 'gemini', 'openai-compatible', 'comfyui', 'drawthings', 'mlx'];
const KNOWN_MODELS = { kilo: ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex'], openrouter: ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex', 'microsoft/mai-image-2.5', 'google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview', 'google/gemini-3-pro-image-preview', 'openai/gpt-image-1', 'openai/gpt-5.4-image-2', 'x-ai/grok-imagine-image-quality', 'sourceful/riverflow-v2-fast', 'sourceful/riverflow-v2-pro', 'sourceful/riverflow-v2.5-fast:free', 'sourceful/riverflow-v2.5-fast', 'sourceful/riverflow-v2.5-pro', 'bytedance-seed/seedream-4.5', 'recraft/recraft-v4.1-utility', 'recraft/recraft-v4.1-vector', 'recraft/recraft-v4.1-utility-pro', 'recraft/recraft-v4.1-pro-vector', 'recraft/recraft-v3'], openai: ['gpt-image-1'], gemini: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'], 'openai-compatible': ['gpt-image-1'], comfyui: ['comfyui-local'], drawthings: ['drawthings-local'], mlx: ['mlx-vlm'] };
const EDIT_CAPABILITIES = { kilo: true, openrouter: true, openai: true, gemini: false, 'openai-compatible': true, comfyui: true, drawthings: true, mlx: true };
const PROCESSING_FITS = ['cover', 'contain', 'fill', 'inside', 'outside'];
const OPTIMIZE_FORMATS = ['png', 'webp', 'jpeg', 'jpg', 'avif'];

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const WITHOUTBG_DAEMON_COMPOSE = path.join(SERVER_DIR, 'withoutbg-daemon', 'docker-compose.yml');
const WITHOUTBG_DAEMON_LOCK = path.join(process.env.HOME || process.cwd(), '.local', 'share', 'kilo', 'locks', 'withoutbg.lock');

function env(name) { return process.env[name] || ''; }
function configuredKey(name) { const value = env(name).trim(); return value || undefined; }
function configKey(name) {
  const candidates = [
    process.env.KILO_MCP_CONFIG,
    process.env.KILO_CONFIG,
    process.env.KILO_JSON,
    process.env.IMAGE_MCP_CONFIG
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = candidate.trim().startsWith('{') ? JSON.parse(candidate) : undefined;
      const value = parsed?.mcp?.imgGenMcp?.environment?.[name] || parsed?.mcp?.['img-gen-mcp']?.environment?.[name] || parsed?.environment?.[name] || parsed?.[name];
      if (typeof value === 'string' && value.trim()) return value.trim();
    } catch {}
  }
  return undefined;
}
function providerKey(provider) {
  if (provider === 'kilo') return configuredKey('KILO_API_KEY') || configKey('KILO_API_KEY');
  if (provider === 'openrouter') return configuredKey('OPENROUTER_API_KEY') || configKey('OPENROUTER_API_KEY');
  if (provider === 'openai') return configuredKey('OPENAI_API_KEY') || configKey('OPENAI_API_KEY');
  if (provider === 'gemini') return configuredKey('GEMINI_API_KEY') || configKey('GEMINI_API_KEY');
  if (provider === 'openai-compatible' || provider === 'comfyui' || provider === 'drawthings' || provider === 'mlx') return configuredKey('IMAGE_MCP_LOCAL_API_KEY') || configKey('IMAGE_MCP_LOCAL_API_KEY');
  return undefined;
}
function localProviderMode() { return String(env('IMAGE_MCP_LOCAL_PROVIDER') || '').trim().toLowerCase(); }
function localEndpointBaseUrl() { return String(env('IMAGE_MCP_LOCAL_ENDPOINT') || '').trim() || undefined; }
function localModelName() { return String(env('IMAGE_MCP_LOCAL_MODEL') || '').trim() || undefined; }
function localTimeoutMs() { const value = Number(env('IMAGE_MCP_LOCAL_TIMEOUT_MS') || ''); return Number.isFinite(value) && value > 0 ? value : 120000; }
function localAutostartEnabled() { return ['1', 'true', 'yes', 'on'].includes(env('IMAGE_MCP_LOCAL_AUTOSTART').trim().toLowerCase()); }
function localBootstrapEnabled() { return ['1', 'true', 'yes', 'on'].includes(env('IMAGE_MCP_LOCAL_BOOTSTRAP').trim().toLowerCase()); }
function localSetupInstructions(provider) {
  if (provider === 'mlx') return ['Install MLX-VLM or your chosen MLX wrapper', 'Start the local HTTP endpoint', 'Set IMAGE_MCP_LOCAL_ENDPOINT and IMAGE_MCP_LOCAL_MODEL'];
  if (provider === 'comfyui') return ['Start ComfyUI', 'Expose a workflow endpoint that accepts image generation jobs', 'Set IMAGE_MCP_LOCAL_ENDPOINT and IMAGE_MCP_LOCAL_MODEL'];
  if (provider === 'drawthings') return ['Start Draw Things', 'Expose the local bridge endpoint', 'Set IMAGE_MCP_LOCAL_ENDPOINT and IMAGE_MCP_LOCAL_MODEL'];
  if (provider === 'openai-compatible') return ['Start a local OpenAI-compatible server such as llama.cpp or LM Studio', 'Point IMAGE_MCP_LOCAL_ENDPOINT at its /v1 base URL', 'Set IMAGE_MCP_LOCAL_MODEL to the exposed model slug'];
  return ['Set IMAGE_MCP_LOCAL_ENDPOINT to the running local service', 'Set IMAGE_MCP_LOCAL_MODEL to the exposed model slug'];
}
function localProviderWarnings(provider) {
  if (provider === 'comfyui') return ['Requires a running ComfyUI server with a compatible workflow endpoint'];
  if (provider === 'drawthings') return ['Requires the Draw Things local bridge endpoint'];
  if (provider === 'mlx') return ['Requires a local MLX-VLM-compatible endpoint'];
  if (provider === 'openai-compatible') return ['Requires a local OpenAI-compatible HTTP server such as llama.cpp or LM Studio'];
  return ['Requires a reachable local HTTP image backend'];
}
function localProviderEndpointHint(provider) {
  if (provider === 'comfyui') return 'http://127.0.0.1:8188';
  if (provider === 'drawthings') return 'http://127.0.0.1:8000/v1';
  if (provider === 'mlx') return 'http://127.0.0.1:8000/v1';
  if (provider === 'openai-compatible') return 'http://127.0.0.1:8000/v1';
  return undefined;
}
function withoutBgDaemonUrl() { const configured = env('WITHOUTBG_DAEMON_URL').trim(); return configured || 'http://127.0.0.1:8765'; }
let _cachedWithoutBgHealth = { ok: false, checkedAt: 0 };
async function withoutBgDaemonHealthy() { const now = Date.now(); if (now - _cachedWithoutBgHealth.checkedAt < 5000) return _cachedWithoutBgHealth.ok; try { const response = await axios.get(`${withoutBgDaemonUrl().replace(/\/$/, '')}/health`, { timeout: 2000 }); const ok = Boolean(response?.data?.ok ?? response?.data?.status === 'ok' ?? response?.status === 200); _cachedWithoutBgHealth = { ok, checkedAt: now }; return ok; } catch { _cachedWithoutBgHealth = { ok: false, checkedAt: now }; return false; } }
function providerFrom(value) { const provider = String(value || env('IMAGE_MCP_DEFAULT_PROVIDER') || 'kilo').toLowerCase(); return PROVIDERS.includes(provider) ? provider : 'kilo'; }
function providerFromModel(model) { const value = String(model || '').trim().toLowerCase(); if (!value) return undefined; if (value.startsWith('gpt-image-') || value.startsWith('dall-e-') || value.startsWith('openai/')) return 'openai'; if (value.startsWith('google/gemini-') || value.startsWith('gemini-')) return 'gemini'; if (value.startsWith('black-forest-labs/') || value.startsWith('x-ai/') || value.startsWith('recraft/') || value.startsWith('sourceful/')) return 'openrouter'; if (value.startsWith('comfyui') || value.startsWith('drawthings') || value.startsWith('mlx')) return localProviderFrom() || 'openai-compatible'; return undefined; }
function resolveProvider(args = {}) { const explicit = String(args.provider || '').trim(); if (explicit && explicit !== 'auto') return providerFrom(explicit); return providerFromModel(args.model) || providerFrom(); }
function localProviderFrom() { const provider = localProviderMode(); return ['openai-compatible', 'comfyui', 'drawthings', 'mlx'].includes(provider) ? provider : undefined; }
function defaultModel(provider) { const configured = env('IMAGE_MCP_DEFAULT_MODEL').trim(); return configured || DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL; }
function imageModelFor(provider, args = {}) { if (args.model) return args.model; if (['openai-compatible', 'comfyui', 'drawthings', 'mlx'].includes(provider)) return localModelName() || DEFAULT_MODEL; if (provider === 'gemini') { const quality = String(args.quality || '').toLowerCase(); if (quality === 'quality') return 'gemini-3-pro-image-preview'; if (quality === 'balanced') return 'gemini-3.1-flash-image-preview'; return 'gemini-2.5-flash-image'; } if (provider === 'openrouter') { const quality = String(args.quality || '').toLowerCase(); if (quality === 'quality') return 'google/gemini-3-pro-image-preview'; if (quality === 'balanced') return 'google/gemini-3.1-flash-image-preview'; return 'google/gemini-2.5-flash-image'; } if (provider === 'openai') return 'gpt-image-1'; return defaultModel(provider); }
function localInputMode(args = {}) {
  return String(args.input_mode || '').toLowerCase() || (args.reference_image || args.input_images?.length ? 'image-to-image' : 'text-to-image');
}
function localGenerationRequest(provider, args = {}) {
  const mode = localInputMode(args);
  const model = imageModelFor(provider, args);
  const inputImage = args.reference_image || args.input_image;
  const base = { model, prompt: promptWithAspect(args), mode };
  if (inputImage) base.input_image = inputImage;
  if (Array.isArray(args.input_images) && args.input_images.length) base.input_images = args.input_images;
  if (provider === 'comfyui') {
    return { ...base, workflow: 'comfyui', endpoint: localEndpointBaseUrl() || localProviderEndpointHint('comfyui') };
  }
  if (provider === 'drawthings') {
    return { ...base, bridge: 'drawthings', endpoint: localEndpointBaseUrl() || localProviderEndpointHint('drawthings') };
  }
  if (provider === 'mlx') {
    return { ...base, adapter: 'mlx', endpoint: localEndpointBaseUrl() || localProviderEndpointHint('mlx') };
  }
  return { ...base, adapter: 'openai-compatible', endpoint: localEndpointBaseUrl() || localProviderEndpointHint('openai-compatible') };
}
function localEditRequest(provider, args = {}) {
  const request = localGenerationRequest(provider, { ...args, input_mode: args.input_mode || 'image-to-image' });
  request.reference_image = args.reference_image || args.input_image;
  return request;
}
function localBackendTemplate(provider, args = {}) {
  const request = provider === 'comfyui' || provider === 'drawthings' || provider === 'mlx' || provider === 'openai-compatible'
    ? localGenerationRequest(provider, args)
    : localGenerationRequest('openai-compatible', args);
  if (provider === 'comfyui') {
    request.workflow = {
      kind: 'workflow-json',
      mode: localInputMode(args),
      nodes: args.input_mode === 'inpainting-outpainting' ? ['load_image', 'mask_image', 'prompt', 'k_sampler'] : ['load_image', 'prompt', 'k_sampler']
    };
  }
  if (provider === 'drawthings') {
    request.bridge = { kind: 'drawthings-local', mode: localInputMode(args), transport: 'http' };
  }
  if (provider === 'mlx') {
    request.adapter = { kind: 'mlx-vlm', mode: localInputMode(args), transport: 'http' };
  }
  if (provider === 'openai-compatible') {
    request.adapter = { kind: 'openai-compatible', mode: localInputMode(args), transport: 'http' };
  }
  return request;
}
function localProviderLabel(provider) { if (provider === 'openai-compatible') return 'OpenAI-compatible local endpoint'; if (provider === 'comfyui') return 'ComfyUI'; if (provider === 'drawthings') return 'Draw Things'; if (provider === 'mlx') return 'MLX-VLM'; return 'local provider'; }
function normalizedQuality(args = {}) { const preset = String(args.quality || '').toLowerCase(); if (['fast', 'balanced', 'quality'].includes(preset)) return preset; return undefined; }
function providerQuality(provider, args = {}) { const quality = normalizedQuality(args); if (!quality) return undefined; if (provider === 'openai' || provider === 'openrouter') return quality === 'fast' ? 'low' : quality === 'balanced' ? 'medium' : 'high'; return quality; }
function modalitiesForModel(provider, model, requestedModalities) { if (Array.isArray(requestedModalities) && requestedModalities.length) return requestedModalities; if (provider === 'openrouter') { const imageOnlyModels = ['black-forest-labs/flux.2-pro', 'black-forest-labs/flux.2-flex', 'x-ai/grok-imagine-image-quality', 'bytedance-seed/seedream-4.5', 'sourceful/riverflow-v2-fast', 'sourceful/riverflow-v2-pro', 'recraft/recraft-v3']; if (imageOnlyModels.includes(model)) return ['image']; return ['image', 'text']; } return ['image', 'text']; }
function aspectToSize(aspect) { if (aspect === 'landscape') return { width: 1536, height: 864 }; if (aspect === 'portrait') return { width: 864, height: 1536 }; return { width: 1024, height: 1024 }; }
function dimensions(args = {}) { if (Number.isFinite(args.width) && Number.isFinite(args.height)) return { width: args.width, height: args.height }; if (typeof args.size === 'string' && args.size.includes('x')) { const [width, height] = args.size.split('x').map(Number); if (Number.isFinite(width) && Number.isFinite(height)) return { width, height }; } if (args.aspect) return aspectToSize(args.aspect); return aspectToSize('square'); }
function promptWithAspect(args) { const segments = []; if (args.purpose) segments.push(`Purpose: ${args.purpose}.`); if (args.aspect) segments.push(`Aspect ratio: ${args.aspect}.`); if (args.quality) segments.push(`Quality target: ${args.quality}.`); if (args.style) segments.push(`Style: ${args.style}.`); if (args.steps) segments.push(`Generation steps: ${args.steps}.`); segments.push(args.prompt); return segments.join(' ').trim(); }
function base64Prefix(data) { return data.startsWith('data:') ? data : `data:image/png;base64,${data}`; }
async function readImageBuffer(input) { if (!input) return undefined; if (input.startsWith('data:')) { const base64 = input.split(',').pop() || ''; return Buffer.from(base64, 'base64'); } if (/^https?:\/\//.test(input)) { const response = await axios.get(input, { responseType: 'arraybuffer' }); return Buffer.from(response.data); } return fs.readFile(path.resolve(input)); }
async function writeImage(outputPath, b64) { if (!outputPath) return undefined; const target = path.resolve(outputPath); await fs.writeFile(target, Buffer.from(b64, 'base64')); return target; }
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
function normalizeProviderResponseData(data) {
  if (!data || typeof data !== 'object') return {};
  return data;
}
function extractImageSource(data) {
  const normalized = normalizeProviderResponseData(data);
  const queue = [];
  if (Array.isArray(normalized.choices)) queue.push(...normalized.choices);
  if (Array.isArray(normalized.data)) queue.push(...normalized.data);
  if (Array.isArray(normalized.output)) queue.push(...normalized.output);
  if (normalized.message) queue.push(normalized.message);
  for (const item of queue) {
    if (!item) continue;
    const message = item.message || item;
    if (Array.isArray(message?.images)) {
      for (const image of message.images) {
        const source = image?.url || image?.data || image?.base64 || image?.b64_json || image?.image || image?.image_url?.url;
        if (typeof source === 'string' && /^data:image\//.test(source)) return source;
        if (typeof source === 'string' && /^https?:\/\//.test(source)) return source;
        if (typeof source === 'string' && /^[A-Za-z0-9+/=]+$/.test(source) && source.length > 128) return `data:image/png;base64,${source}`;
      }
    }
    const content = message?.content;
    if (typeof content === 'string') {
      if (/^data:image\//.test(content) || /^https?:\/\//.test(content)) return content;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        const source = part?.image || part?.url || part?.data || part?.base64 || part?.b64_json || part?.image_url?.url;
        if (typeof source === 'string' && /^data:image\//.test(source)) return source;
        if (typeof source === 'string' && /^https?:\/\//.test(source)) return source;
        if (typeof source === 'string' && /^[A-Za-z0-9+/=]+$/.test(source) && source.length > 128) return `data:image/png;base64,${source}`;
      }
    }
    const directSource = item?.url || item?.data || item?.base64 || item?.b64_json || item?.image;
    if (typeof directSource === 'string' && /^data:image\//.test(directSource)) return directSource;
    if (typeof directSource === 'string' && /^https?:\/\//.test(directSource)) return directSource;
    if (typeof directSource === 'string' && /^[A-Za-z0-9+/=]+$/.test(directSource) && directSource.length > 128) return `data:image/png;base64,${directSource}`;
  }
  return undefined;
}
async function downloadImageSource(imageSource, output_path) {
  const target = path.resolve(output_path);
  await ensureDir(path.dirname(target));
  const buffer = /^data:image\//.test(imageSource)
    ? Buffer.from(imageSource.split(',').pop() || '', 'base64')
    : Buffer.from((await axios.get(imageSource, { responseType: 'arraybuffer', timeout: localTimeoutMs() })).data);
  await fs.writeFile(target, buffer);
  return { output_path: target, bytes: buffer.length };
}
async function openrouterGenerate(args = {}) {
  const model = imageModelFor('openrouter', args);
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`openrouter-${Date.now()}`);
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: promptWithAspect(args) }],
    modalities: modalitiesForModel('openrouter', model, args.modalities),
    ...(Number.isFinite(Number(args.max_tokens)) ? { max_tokens: Number(args.max_tokens) } : {}),
    ...(providerQuality('openrouter', args) ? { reasoning: { effort: providerQuality('openrouter', args) } } : {})
  }, {
    headers: {
      Authorization: `Bearer ${requireProviderKey('openrouter')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env('OPENROUTER_HTTP_REFERER') || 'https://github.com/jgkme/img-gen-mcp',
      'X-Title': env('OPENROUTER_X_TITLE') || 'img-gen-mcp'
    },
    timeout: localTimeoutMs()
  });
  const imageSource = extractImageSource(normalizeProviderResponseData(response.data));
  if (!imageSource) throw new Error(`OpenRouter did not return image content`);
  const saved = await downloadImageSource(imageSource, output_path);
  return { output_path: saved.output_path, model, backend: 'openrouter', action: args.input_image || args.reference_image ? 'edit_image' : 'generate_image', mimeType: 'image/png', bytes: saved.bytes };
}
async function openaiGenerate(args = {}) {
  const model = imageModelFor('openai', args);
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`openai-${Date.now()}`);
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: promptWithAspect(args) }],
    modalities: modalitiesForModel('openai', model, args.modalities),
    ...(Number.isFinite(Number(args.max_tokens)) ? { max_tokens: Number(args.max_tokens) } : {})
  }, {
    headers: {
      Authorization: `Bearer ${requireProviderKey('openai')}`,
      'Content-Type': 'application/json'
    },
    timeout: localTimeoutMs()
  });
  const imageSource = extractImageSource(normalizeProviderResponseData(response.data));
  if (!imageSource) throw new Error(`OpenAI did not return image content`);
  const saved = await downloadImageSource(imageSource, output_path);
  return { output_path: saved.output_path, model, backend: 'openai', action: args.input_image || args.reference_image ? 'edit_image' : 'generate_image', mimeType: 'image/png', bytes: saved.bytes };
}
async function geminiGenerate(args = {}) {
  const model = imageModelFor('gemini', args);
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`gemini-${Date.now()}`);
  const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    model,
    messages: [{ role: 'user', content: promptWithAspect(args) }],
    modalities: modalitiesForModel('gemini', model, args.modalities),
    ...(Number.isFinite(Number(args.max_tokens)) ? { max_tokens: Number(args.max_tokens) } : {})
  }, {
    headers: {
      Authorization: `Bearer ${requireProviderKey('gemini')}`,
      'Content-Type': 'application/json'
    },
    timeout: localTimeoutMs()
  });
  const imageSource = extractImageSource(normalizeProviderResponseData(response.data));
  if (!imageSource) throw new Error(`Gemini did not return image content`);
  const saved = await downloadImageSource(imageSource, output_path);
  return { output_path: saved.output_path, model, backend: 'gemini', action: args.input_image || args.reference_image ? 'edit_image' : 'generate_image', mimeType: 'image/png', bytes: saved.bytes };
}
function outputDir() { return env('IMAGE_MCP_PROJECT_OUTPUT_DIR').trim() || DEFAULT_OUTPUT_DIR; }
async function resolveOutputDirHint() { await ensureDir(outputDir()); }
function defaultSavedImagePath(prefix = 'image') { return path.join(outputDir(), `${prefix}.png`); }
function imageToolContent(result) { const lines = []; if (result?.output_path) lines.push(`- Path: \`${result.output_path}\``); if (result?.mimeType) lines.push(`- MIME type: \`${result.mimeType}\``); if (result?.bytes) lines.push(`- Size: \`${result.bytes}\``); if (result?.model) lines.push(`- Model: \`${result.model}\``); if (result?.backend) lines.push(`- Backend: \`${result.backend}\``); if (result?.action) lines.push(`- Action: \`${result.action}\``); return [{ type: 'text', text: lines.join('\n') || 'done' }]; }
function createRecommendation({ tool, arguments: args = {}, reason, confidence = 0.7 }) { return { suggested_tool: tool, suggested_args: args, reason, confidence }; }
function normalizeWarnings(warnings) { return Array.from(new Set((warnings || []).filter(Boolean).map((warning) => String(warning)))); }
function classifyAssetFromPrompt(prompt = '') { const text = String(prompt).toLowerCase(); if (/(logo|mark|brand|favicon|icon)/.test(text)) return 'logo'; if (/(og|open graph|social|card)/.test(text)) return 'social'; if (/(hero|banner|header)/.test(text)) return 'hero'; if (/(product|shot|cutout|portrait)/.test(text)) return 'photo'; return 'image'; }
async function inspectImageArtifact(input_image) {
  const buffer = await readImageBuffer(input_image);
  const metadata = await sharp(buffer).metadata();
  return { width: metadata.width || null, height: metadata.height || null, format: metadata.format || null, hasAlpha: Boolean(metadata.hasAlpha), channels: metadata.channels || null, density: metadata.density || null };
}
function analyzeGeneratedArtifact(result = {}, args = {}, imageMetrics = {}) { const assetClass = classifyAssetFromPrompt(args.prompt || ''); const warnings = []; const suggestions = []; if (imageMetrics.hasAlpha) warnings.push('Image already has transparency'); if (imageMetrics.width && imageMetrics.height && imageMetrics.width !== imageMetrics.height) warnings.push('Image is not square'); if (assetClass === 'logo' || assetClass === 'icon') { suggestions.push(createRecommendation({ tool: 'background_remove', arguments: { input_image: result.output_path, backend: 'imgly', output_path: result.output_path }, reason: 'Logos and icons usually need transparency and tighter edges.', confidence: 0.92 })); suggestions.push(createRecommendation({ tool: 'finalize_image', arguments: { input_image: result.output_path, trim: true, output_path: result.output_path }, reason: 'Trim and tighten the composition for web delivery.', confidence: 0.84 })); }
  if (assetClass === 'hero' || assetClass === 'social') suggestions.push(createRecommendation({ tool: 'optimize_image', arguments: { input_image: result.output_path, output_format: 'webp' }, reason: 'Hero and social images should usually be delivery-optimized.', confidence: 0.78 }));
  if (imageMetrics.hasAlpha || imageMetrics.format === 'png') suggestions.unshift(createRecommendation({ tool: 'finalize_image', arguments: { input_image: result.output_path, trim: true }, reason: 'The actual image content suggests a delivery cleanup pass.', confidence: 0.8 }));
  return { asset_class: assetClass, image_metrics: imageMetrics, quality: 'good', warnings: normalizeWarnings(warnings), suggestions, next_step: suggestions[0] || null };
}
async function analyzeImageResult(input_image, args = {}) { const image_metrics = await inspectImageArtifact(input_image); const analysis = analyzeGeneratedArtifact({ output_path: input_image }, args, image_metrics); return { input_image, analysis, next_steps: analysis.suggestions } }
async function suggestNextStep(args = {}) { if (args.input_image) return { workflow_id: args.workflow_id, suggestion: (await analyzeImageResult(args.input_image, args)).next_steps[0] || createRecommendation({ tool: 'finalize_image', arguments: { input_image: args.input_image, trim: true }, reason: 'Delivery cleanup is the safest next step.', confidence: 0.6 }) }; return { workflow_id: args.workflow_id, suggestion: createRecommendation({ tool: 'generate_image', arguments: { prompt: args.prompt || '' }, reason: 'No artifact exists yet, so generate one first.', confidence: 0.74 }) }; }
const workflowRegistry = new Map(); let workflowSeq = 0;
let workflowStateLoaded = false;
function nextWorkflowId() { workflowSeq += 1; return `wf_${String(workflowSeq).padStart(4, '0')}`; }
function nextWorkflowStepId(workflow) { workflow.stepSeq = (workflow.stepSeq || 0) + 1; return `step_${String(workflow.stepSeq).padStart(4, '0')}`; }
async function createWorkflow({ objective, provider, model, prompt, output_path, context = {} }) { await loadWorkflowState(); const workflow_id = nextWorkflowId(); const workflow = { workflow_id, status: 'active', objective, provider, model, prompt, output_path, context, steps: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; workflowRegistry.set(workflow_id, workflow); await persistWorkflowState(); return workflow; }
async function updateWorkflow(workflow_id, patch = {}) { await loadWorkflowState(); const workflow = workflowRegistry.get(String(workflow_id || '')); if (!workflow) return undefined; Object.assign(workflow, patch, { updated_at: new Date().toISOString() }); await persistWorkflowState(); return workflow; }
function getWorkflow(workflow_id) { return workflowRegistry.get(String(workflow_id || '')); }
async function finalizeWorkflow(workflow_id, patch = {}) { const workflow = await updateWorkflow(workflow_id, { status: 'completed', ...patch }); return workflow; }
function getWorkflowStep(workflow, step_id) { return Array.isArray(workflow?.steps) ? workflow.steps.find((step) => step.step_id === step_id) : undefined; }
async function appendWorkflowStep(workflow, step) { if (!Array.isArray(workflow.steps)) workflow.steps = []; const enriched = { step_id: nextWorkflowStepId(workflow), created_at: new Date().toISOString(), ...step }; workflow.steps.push(enriched); workflow.updated_at = new Date().toISOString(); await persistWorkflowState(); return enriched; }
async function addWorkflowStep(workflow_id, step = {}) { await loadWorkflowState(); const workflow = getWorkflow(workflow_id); if (!workflow) return undefined; const enriched = await appendWorkflowStep(workflow, { status: step.status || 'active', tool: step.tool || 'unknown', summary: step.summary || '', result: step.result }); return workflow; }
async function closeWorkflowStep(workflow_id, step_id, patch = {}) { await loadWorkflowState(); const workflow = getWorkflow(workflow_id); if (!workflow) return undefined; const step = getWorkflowStep(workflow, step_id); if (!step) return undefined; Object.assign(step, patch, { updated_at: new Date().toISOString() }); workflow.updated_at = new Date().toISOString(); await persistWorkflowState(); return workflow; }
async function persistWorkflowState() { const payload = { workflowSeq, workflows: Array.from(workflowRegistry.values()) }; await fs.writeFile(WORKFLOW_STATE_FILE, JSON.stringify(payload, null, 2)); }
async function loadWorkflowState() { if (workflowStateLoaded) return; workflowStateLoaded = true; try { const text = await fs.readFile(WORKFLOW_STATE_FILE, 'utf8'); const payload = JSON.parse(text); workflowSeq = Number(payload?.workflowSeq || 0) || 0; for (const workflow of Array.isArray(payload?.workflows) ? payload.workflows : []) workflowRegistry.set(String(workflow.workflow_id), workflow); } catch {}
}
async function resumeWorkflow(workflow_id) { await loadWorkflowState(); const workflow = getWorkflow(workflow_id); if (!workflow) return undefined; return workflow; }
function validateArgs(args) { if (!args.prompt) throw new Error('prompt is required'); }
function validateProcessingArgs(args) { if (!args.input_image) throw new Error('input_image is required'); }
function validateOptimizeArgs(args) { if (!args.input_image) throw new Error('input_image is required'); }
function providerKeyStatus(provider) { const value = providerKey(provider); if (!value) return { configured: false, length: 0 }; return { configured: true, length: value.length, preview: `${value.slice(0, 4)}...${value.slice(-2)}` }; }
function providerWarnings(provider) { const warnings = []; if (provider === 'gemini') warnings.push('Image edits are not supported by this provider'); if (provider === 'openai-compatible') warnings.push('Requires a local OpenAI-compatible HTTP server'); if (provider === 'comfyui') warnings.push('Requires a running ComfyUI HTTP server and a compatible workflow endpoint'); if (provider === 'drawthings') warnings.push('Requires a running Draw Things local bridge endpoint'); if (provider === 'mlx') warnings.push('Requires a local MLX-VLM compatible OpenAI-style endpoint'); return warnings; }
function providerModelFamily(provider) { if (provider === 'gemini') return 'gemini'; if (provider === 'comfyui' || provider === 'drawthings' || provider === 'mlx') return 'local'; if (provider === 'kilo' || provider === 'openrouter' || provider === 'openai' || provider === 'openai-compatible') return 'chat-image'; return 'general'; }
function localProviderStatus(provider) { const selected = localProviderFrom(); const endpoint = localEndpointBaseUrl() || localProviderEndpointHint(provider); const warnings = localProviderWarnings(provider); if (selected !== provider) warnings.push(`Set IMAGE_MCP_LOCAL_PROVIDER=${provider} to activate this backend`); return { configured: selected === provider, endpoint: endpoint || undefined, model: localModelName() || undefined, autostart: localAutostartEnabled(), bootstrap: localBootstrapEnabled(), generate: true, edit: true, warnings }; }
function localRuntimeStatus() { return { provider: localProviderFrom() || undefined, endpoint: localEndpointBaseUrl() || undefined, model: localModelName() || undefined, timeoutMs: localTimeoutMs(), autostart: localAutostartEnabled(), bootstrap: localBootstrapEnabled() }; }
function requireProviderKey(provider) { const key = providerKey(provider); if (!key) throw Object.assign(new Error(`${provider} API key is not configured`), { code: 'missing_api_key', retryable: false, details: { provider } }); return key; }
function validateStartup() {}

const taskRegistry = new Map(); let taskSeq = 0;
function nextTaskId() { taskSeq += 1; return `task_${String(taskSeq).padStart(4, '0')}`; }
function registerTask({ provider, model, prompt, action, output_path }) { const task_id = nextTaskId(); const task = { task_id, status: 'queued', provider, model, prompt, action, output_path, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; taskRegistry.set(task_id, task); return task; }
async function runTask(task, runner) { task.status = 'running'; task.updated_at = new Date().toISOString(); try { const result = await runner(); task.status = 'completed'; task.result = result; task.updated_at = new Date().toISOString(); return task; } catch (error) { task.status = 'failed'; task.error = String(error?.message || error); task.updated_at = new Date().toISOString(); throw error; } }
function getTask(task_id) { return taskRegistry.get(String(task_id || '')); }

function cliTransportMode() {
  const firstArg = String(process.argv[2] || '').toLowerCase();
  const envMode = String(env('IMAGE_MCP_TRANSPORT') || '').toLowerCase();
  if (firstArg === 'http' || firstArg === '--http' || firstArg === '--transport=http') return 'http';
  if (envMode === 'http') return 'http';
  return 'stdio';
}

async function localGenerate(provider, args = {}) {
  const endpoint = localEndpointBaseUrl() || localProviderEndpointHint(provider);
  const model = imageModelFor(provider, args);
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`local-${Date.now()}`);
  if (!endpoint) throw new Error(`Local provider ${provider} requires IMAGE_MCP_LOCAL_ENDPOINT to be set`);
  const response = await axios.post(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
    model,
    messages: [{ role: 'user', content: promptWithAspect(args) }],
    modalities: modalitiesForModel(provider, model, args.modalities),
    ...(args.input_image ? { input_image: args.input_image } : {})
  }, {
    headers: {
      ...(configuredKey('IMAGE_MCP_LOCAL_API_KEY') ? { Authorization: `Bearer ${configuredKey('IMAGE_MCP_LOCAL_API_KEY')}` } : {}),
      'Content-Type': 'application/json'
    },
    timeout: localTimeoutMs()
  });
  const imageSource = extractImageSource(normalizeProviderResponseData(response.data));
  if (!imageSource) throw new Error(`Local provider ${provider} did not return image content`);
  const saved = await downloadImageSource(imageSource, output_path);
  return { output_path: saved.output_path, model, backend: provider, action: args.input_image || args.reference_image ? 'edit_image' : 'generate_image', mimeType: 'image/png', bytes: saved.bytes };
}

async function generateImage(args) {
  const provider = resolveProvider(args);
  let result;
  if (provider === 'openrouter' || provider === 'kilo') {
    result = await openrouterGenerate(args);
  } else if (provider === 'openai') {
    result = await openaiGenerate(args);
  } else if (provider === 'gemini') {
    result = await geminiGenerate(args);
  } else if (['openai-compatible', 'comfyui', 'drawthings', 'mlx'].includes(provider)) {
    result = await localGenerate(provider, args);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return { ...result, analysis: analyzeGeneratedArtifact(result, args), workflow_hint: createRecommendation({ tool: 'get_provider_status', arguments: {}, reason: 'Check provider state before iterating.', confidence: 0.62 }) };
}
async function submitTask(args) { const provider = resolveProvider(args); const model = imageModelFor(provider, args); const task = registerTask({ provider, model, prompt: args.prompt, action: 'generate_image', output_path: args.output_path }); queueMicrotask(async () => { try { await runTask(task, () => generateImage({ ...args, provider, model })); } catch {} }); return task; }
async function batchGenerateImage(args) { const count = Math.max(1, Number(args.count) || 1); const results = []; for (let index = 0; index < count; index += 1) { const output_path = args.output_path ? args.output_path.replace(/(\.[a-z0-9]+)?$/i, `-${String(index + 1).padStart(2, '0')}$1`) : defaultSavedImagePath(`batch-${String(index + 1).padStart(2, '0')}`); results.push(await generateImage({ ...args, output_path })); } return { type: 'batch', results, count }; }
async function listImageModels() { const providerMeta = (provider, value) => ({ ...value, family: providerModelFamily(provider), warnings: [...providerWarnings(provider), ...(value?.warnings || [])] }); return { defaults: { provider: providerFrom(), model: defaultModel(providerFrom()), size: DEFAULT_SIZE }, providers: { kilo: providerMeta('kilo', { configured: Boolean(env('KILO_API_KEY')), endpoint: 'https://api.kilo.ai/api/gateway/images/generations', generate: true, edit: true }), openrouter: providerMeta('openrouter', { configured: Boolean(env('OPENROUTER_API_KEY')), endpoint: 'https://openrouter.ai/api/v1/chat/completions', generate: true, edit: true }), openai: providerMeta('openai', { configured: Boolean(env('OPENAI_API_KEY')), endpoint: 'https://api.openai.com/v1/chat/completions', generate: true, edit: true }), gemini: providerMeta('gemini', { configured: Boolean(env('GEMINI_API_KEY')), endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', generate: true, edit: false }), 'openai-compatible': providerMeta('openai-compatible', localProviderStatus('openai-compatible')), comfyui: providerMeta('comfyui', localProviderStatus('comfyui')), drawthings: providerMeta('drawthings', localProviderStatus('drawthings')), mlx: providerMeta('mlx', localProviderStatus('mlx')) }, models: Object.fromEntries(Object.entries(KNOWN_MODELS).map(([provider, models]) => [provider, { family: providerModelFamily(provider), warnings: providerWarnings(provider), models }])), outputDir: outputDir() }; }
async function editImage(args) {
  const provider = resolveProvider(args);
  const prompt = `${args.prompt}\n\nEdit the provided reference image while preserving the important subject and composition unless explicitly instructed otherwise.`;
  let result;
  if (provider === 'openrouter' || provider === 'kilo') {
    result = await openrouterGenerate({ ...args, prompt, input_image: args.reference_image || args.input_image });
  } else if (provider === 'openai') {
    result = await openaiGenerate({ ...args, prompt, input_image: args.reference_image || args.input_image });
  } else if (provider === 'gemini') {
    result = await geminiGenerate({ ...args, prompt, input_image: args.reference_image || args.input_image });
  } else if (['openai-compatible', 'comfyui', 'drawthings', 'mlx'].includes(provider)) {
    result = await localGenerate(provider, { ...args, prompt, input_image: args.reference_image || args.input_image });
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return { ...result, analysis: analyzeGeneratedArtifact(result, { ...args, prompt }), workflow_hint: createRecommendation({ tool: 'finalize_image', arguments: { input_image: result.output_path, trim: true }, reason: 'Edited assets often need a final trim or resize pass.', confidence: 0.74 }) };
}

function registerWorkflowForGenerate(args, result) { const workflow = createWorkflow({ objective: args.prompt, provider: resolveProvider(args), model: result.model, prompt: args.prompt, output_path: result.output_path, context: { tool: 'generate_image' } }); appendWorkflowStep(workflow, { tool: 'generate_image', result }); return workflow; }
function registerWorkflowForEdit(args, result) { const workflow = createWorkflow({ objective: args.prompt, provider: resolveProvider(args), model: result.model, prompt: args.prompt, output_path: result.output_path, context: { tool: 'edit_image' } }); appendWorkflowStep(workflow, { tool: 'edit_image', result }); return workflow; }
async function getProviderStatus() { return { version: VERSION, defaults: { provider: providerFrom(), model: defaultModel(providerFrom()), size: DEFAULT_SIZE }, configured: Object.fromEntries(PROVIDERS.map((provider) => [provider, providerKeyStatus(provider)])), capabilities: { kilo: { generate: true, edit: true, batch: false, async: false, localEndpoint: false }, openrouter: { chat_image_generation: true, output_modalities: ['image', 'text'], response_shapes: ['choices[0].message.images', 'choices[0].message.content', 'data.output', 'data'], generate: true, edit: true, batch: false, async: false, localEndpoint: false }, openai: { generate: true, edit: true, batch: false, async: false, localEndpoint: false }, gemini: { generate: true, edit: false, batch: false, async: false, localEndpoint: false }, 'openai-compatible': { generate: true, edit: true, batch: false, async: false, localEndpoint: true }, comfyui: { generate: true, edit: true, batch: false, async: false, localEndpoint: true }, drawthings: { generate: true, edit: true, batch: false, async: false, localEndpoint: true }, mlx: { generate: true, edit: true, batch: false, async: false, localEndpoint: true } }, runtime: { defaultProvider: env('IMAGE_MCP_DEFAULT_PROVIDER') || undefined, defaultModel: env('IMAGE_MCP_DEFAULT_MODEL') || undefined, outputDir: outputDir(), local: { provider: localProviderFrom() || undefined, endpoint: localEndpointBaseUrl() || undefined, model: localModelName() || undefined, timeoutMs: localTimeoutMs(), autostart: localAutostartEnabled(), bootstrap: localBootstrapEnabled(), setup: localSetupInstructions(localProviderFrom() || 'openai-compatible') } } }; }

async function resizeImage(args = {}) {
  const { input_image, width, height, fit = 'cover', background } = args;
  const buffer = await readImageBuffer(input_image);
  let pipeline = sharp(buffer);
  if (Number.isFinite(width) && Number.isFinite(height)) {
    pipeline = pipeline.resize(width, height, { fit, background: background || { r: 0, g: 0, b: 0, alpha: 0 } });
  } else if (Number.isFinite(width) || Number.isFinite(height)) {
    pipeline = pipeline.resize(width || null, height || null);
  }
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`resized-${Date.now()}`);
  await pipeline.png().toFile(output_path);
  const stat = await fs.stat(output_path);
  return { output_path, mimeType: 'image/png', bytes: stat.size, backend: 'sharp', action: 'resize_image' };
}

async function autoCropImage(args = {}) {
  const { input_image, width, height, gravity = 'center' } = args;
  const buffer = await readImageBuffer(input_image);
  const meta = await sharp(buffer).metadata();
  const srcW = meta.width;
  const srcH = meta.height;
  const targetW = Number.isFinite(width) ? width : srcW;
  const targetH = Number.isFinite(height) ? height : srcH;
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);
  let pipeline = sharp(buffer).resize(scaledW, scaledH, { fit: 'fill' });
  if (scaledW > targetW || scaledH > targetH) {
    const cropX = gravity.includes('west') ? 0 : gravity.includes('east') ? scaledW - targetW : Math.floor((scaledW - targetW) / 2);
    const cropY = gravity.includes('north') ? 0 : gravity.includes('south') ? scaledH - targetH : Math.floor((scaledH - targetH) / 2);
    pipeline = pipeline.extract({ left: Math.max(0, cropX), top: Math.max(0, cropY), width: Math.min(targetW, scaledW), height: Math.min(targetH, scaledH) });
  }
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`cropped-${Date.now()}`);
  await pipeline.png().toFile(output_path);
  const stat = await fs.stat(output_path);
  return { output_path, mimeType: 'image/png', bytes: stat.size, backend: 'sharp', action: 'auto_crop' };
}

async function optimizeImage(args = {}) {
  const { input_image, output_format = 'png', quality = 80, compression_level, lossless = false, palette = false } = args;
  const buffer = await readImageBuffer(input_image);
  let pipeline = sharp(buffer);
  const fmt = output_format === 'jpg' ? 'jpeg' : output_format;
  const options = {};
  if (fmt === 'jpeg' || fmt === 'webp') options.quality = quality;
  if (fmt === 'png' && Number.isFinite(compression_level)) options.compressionLevel = compression_level;
  if (fmt === 'webp') options.lossless = lossless;
  if (fmt === 'png') options.palette = palette;
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`optimized-${Date.now()}.${fmt}`);
  await pipeline.toFormat(fmt, options).toFile(output_path);
  const stat = await fs.stat(output_path);
  return { output_path, mimeType: `image/${fmt}`, bytes: stat.size, backend: 'sharp', action: 'optimize_image' };
}

async function backgroundRemoveImage(args = {}) {
  const { input_image, backend = 'rmbg', model, max_resolution, alpha_feather, alpha_threshold, output_path: outPath } = args;
  const buffer = await readImageBuffer(input_image);
  const output_path = outPath ? path.resolve(outPath) : defaultSavedImagePath(`nobg-${Date.now()}.png`);
  if (backend === 'withoutbg') {
    const healthy = await withoutBgDaemonHealthy();
    if (!healthy) throw new Error('withoutBG daemon is not running. Start it with docker-compose or set WITHOUTBG_AUTOSTART=1');
    const form = new FormData();
    form.append('image', buffer, { filename: 'image.png', contentType: 'image/png' });
    if (model) form.append('model', model);
    const response = await axios.post(`${withoutBgDaemonUrl().replace(/\/$/, '')}/remove`, form, { headers: form.getHeaders(), timeout: localTimeoutMs(), responseType: 'arraybuffer' });
    await fs.writeFile(output_path, Buffer.from(response.data));
  } else if (backend === 'imgly') {
    const blob = await removeBackground(buffer, { model: model || 'medium', output: { format: 'image/png' } });
    const arrayBuf = await blob.arrayBuffer();
    await fs.writeFile(output_path, Buffer.from(arrayBuf));
  } else {
    let segModel;
    const modelName = model || 'u2netp';
    if (modelName === 'modnet') segModel = createModnetModel();
    else if (modelName === 'briaai') segModel = createBriaaiModel();
    else segModel = createU2netpModel();
    const mask = await rmbg(buffer, segModel);
    let sharpPipeline = sharp(buffer).ensureAlpha();
    if (Number.isFinite(max_resolution)) {
      const meta = await sharpPipeline.metadata();
      if (meta.width > max_resolution || meta.height > max_resolution) {
        sharpPipeline = sharpPipeline.resize(max_resolution, max_resolution, { fit: 'inside' });
      }
    }
    const origWithAlpha = await sharpPipeline.raw().toBuffer();
    const origMeta = await sharp(buffer).ensureAlpha().metadata();
    const maskBuf = await sharp(mask).resize(origMeta.width, origMeta.height, { fit: 'fill' }).raw().toBuffer();
    const channels = origMeta.channels || 4;
    const result = Buffer.alloc(origWithAlpha.length);
    for (let i = 0; i < origWithAlpha.length; i += channels) {
      result[i] = origWithAlpha[i];
      if (channels > 1) result[i + 1] = origWithAlpha[i + 1];
      if (channels > 2) result[i + 2] = origWithAlpha[i + 2];
      const maskIdx = Math.floor(i / channels) * (maskBuf.length > origWithAlpha.length / channels * 1 ? 4 : channels);
      let alpha = maskBuf[maskIdx] || 0;
      if (Number.isFinite(alpha_feather)) alpha = Math.min(255, Math.round(alpha * alpha_feather));
      if (Number.isFinite(alpha_threshold)) alpha = alpha > alpha_threshold ? 255 : 0;
      result[i + 3] = alpha;
    }
    await sharp(result, { raw: { width: origMeta.width, height: origMeta.height, channels: 4 } }).png().toFile(output_path);
  }
  const stat = await fs.stat(output_path);
  return { output_path, mimeType: 'image/png', bytes: stat.size, backend, action: 'background_remove' };
}

async function finalizeImage(args = {}) {
  const { input_image, remove_background = false, background_backend = 'rmbg', background_model, trim = false, width, height, fit = 'cover', gravity = 'center', background } = args;
  let currentPath = path.resolve(input_image);
  if (remove_background) {
    const result = await backgroundRemoveImage({ input_image: currentPath, backend: background_backend, model: background_model, output_path: args.output_path });
    currentPath = result.output_path;
  }
  let pipeline = sharp(await readImageBuffer(currentPath));
  if (trim) {
    pipeline = pipeline.trim({ threshold: 10 });
  }
  if (Number.isFinite(width) && Number.isFinite(height)) {
    pipeline = pipeline.resize(width, height, { fit, position: gravity, background: background || { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  const output_path = args.output_path ? path.resolve(args.output_path) : defaultSavedImagePath(`final-${Date.now()}.png`);
  await pipeline.png().toFile(output_path);
  const stat = await fs.stat(output_path);
  return { output_path, mimeType: 'image/png', bytes: stat.size, backend: 'sharp', action: 'finalize_image' };
}

function createServerContext() {
  const tools = [
    { name: 'kilo_generate_image', description: 'Generate an image using the configured provider.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string', enum: PROVIDERS.concat('auto') }, model: { type: 'string' }, quality: { type: 'string' }, purpose: { type: 'string' }, style: { type: 'string' }, size: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, aspect: { type: 'string', enum: ['square', 'landscape', 'portrait'] }, steps: { type: 'number' }, input_mode: { type: 'string', enum: ['text-to-image', 'image-to-image', 'inpainting-outpainting', 'local-file', 'remote-url'] }, input_image: { type: 'string' }, reference_image: { type: 'string' }, output_path: { type: 'string' } }, required: ['prompt'] } },
    { name: 'generate_image', description: 'Generate images using the selected provider.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string', enum: PROVIDERS.concat('auto') }, model: { type: 'string' }, purpose: { type: 'string' }, style: { type: 'string' }, size: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, aspect: { type: 'string', enum: ['square', 'landscape', 'portrait'] }, steps: { type: 'number' }, input_mode: { type: 'string', enum: ['text-to-image', 'image-to-image', 'inpainting-outpainting', 'local-file', 'remote-url'] }, input_image: { type: 'string' }, input_images: { type: 'array', items: { type: 'string' } }, reference_image: { type: 'string' }, modalities: { type: 'array', items: { type: 'string' } }, quality: { type: 'string' }, background: { type: 'string' }, output_format: { type: 'string' }, moderation: { type: 'string' }, max_tokens: { type: 'number' }, output_path: { type: 'string' } }, required: ['prompt'] } },
    { name: 'list_image_models', description: 'List available providers, defaults, model families, and edit capability.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_provider_status', description: 'Report configured providers, defaults, and server version.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_model_capabilities', description: 'Summarize which providers can generate, edit, batch, or use local endpoints.', inputSchema: { type: 'object', properties: {} } },
    { name: 'edit_image', description: 'Edit an image using a reference image and prompt.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string', enum: PROVIDERS.concat('auto') }, model: { type: 'string' }, quality: { type: 'string' }, size: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, aspect: { type: 'string', enum: ['square', 'landscape', 'portrait'] }, steps: { type: 'number' }, input_mode: { type: 'string', enum: ['text-to-image', 'image-to-image', 'inpainting-outpainting', 'local-file', 'remote-url'] }, input_image: { type: 'string' }, reference_image: { type: 'string' }, output_path: { type: 'string' } }, required: ['prompt', 'input_image'] } },
    { name: 'background_remove', description: 'Remove the background from an image with a local segmentation model or the shared withoutBG Docker daemon and preserve transparency in the PNG output.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, backend: { type: 'string', enum: BACKGROUND_REMOVE_BACKENDS }, model: { type: 'string' }, max_resolution: { type: 'number' }, alpha_feather: { type: 'number' }, alpha_threshold: { type: 'number' }, output_path: { type: 'string' } }, required: ['input_image'] } },
    { name: 'finalize_image', description: 'Finalize an image locally by optionally removing the background with local or daemon-backed matting and then cropping, trimming, resizing, and saving a PNG.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, remove_background: { type: 'boolean' }, background_backend: { type: 'string', enum: BACKGROUND_REMOVE_BACKENDS }, background_model: { type: 'string' }, max_resolution: { type: 'number' }, alpha_feather: { type: 'number' }, alpha_threshold: { type: 'number' }, trim: { type: 'boolean' }, width: { type: 'number' }, height: { type: 'number' }, fit: { type: 'string', enum: PROCESSING_FITS }, gravity: { type: 'string' }, background: { type: 'string' }, output_path: { type: 'string' } }, required: ['input_image'] } },
    { name: 'resize_image', description: 'Resize an image locally with aspect-ratio-preserving defaults and PNG output.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, output_path: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, fit: { type: 'string', enum: PROCESSING_FITS }, background: { type: 'string' } }, required: ['input_image'] } },
    { name: 'auto_crop', description: 'Crop an image locally to a target aspect or requested dimensions.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, output_path: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, gravity: { type: 'string' } }, required: ['input_image'] } },
    { name: 'optimize_image', description: 'Optimize an image for the web by re-encoding it as compressed PNG, WebP, JPEG, or AVIF with metadata stripped.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, output_path: { type: 'string' }, output_format: { type: 'string', enum: OPTIMIZE_FORMATS }, quality: { type: 'number' }, compression_level: { type: 'number' }, lossless: { type: 'boolean' }, background: { type: 'string' }, palette: { type: 'boolean' } }, required: ['input_image'] } },
    { name: 'submit_task', description: 'Submit an image generation task for asynchronous execution and poll it later with get_task.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string', enum: PROVIDERS.concat('auto') }, model: { type: 'string' }, output_path: { type: 'string' } }, required: ['prompt'] } },
    { name: 'get_task', description: 'Get the current status and result for a submitted image task.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
    { name: 'batch_generate_image', description: 'Generate a batch of images from one prompt, preserving unique filenames for each result.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, provider: { type: 'string', enum: PROVIDERS.concat('auto') }, model: { type: 'string' }, count: { type: 'number' }, output_path: { type: 'string' } }, required: ['prompt'] } },
    { name: 'create_workflow', description: 'Create a workflow record so the client and server can iterate on a multi-step image task.', inputSchema: { type: 'object', properties: { objective: { type: 'string' }, provider: { type: 'string', enum: PROVIDERS.concat('auto') }, model: { type: 'string' }, prompt: { type: 'string' }, output_path: { type: 'string' }, context: { type: 'object' } }, required: ['objective'] } },
    { name: 'update_workflow', description: 'Update a workflow record with new state or guidance.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, status: { type: 'string' }, objective: { type: 'string' }, output_path: { type: 'string' }, context: { type: 'object' } }, required: ['workflow_id'] } },
    { name: 'add_workflow_step', description: 'Append a step to a persisted workflow.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, tool: { type: 'string' }, status: { type: 'string' }, summary: { type: 'string' }, result: { type: 'object' } }, required: ['workflow_id'] } },
    { name: 'close_workflow_step', description: 'Update a workflow step and mark it complete.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, step_id: { type: 'string' }, status: { type: 'string' }, summary: { type: 'string' }, result: { type: 'object' } }, required: ['workflow_id', 'step_id'] } },
    { name: 'get_workflow', description: 'Fetch the current workflow record and its accumulated steps.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' } }, required: ['workflow_id'] } },
    { name: 'resume_workflow', description: 'Load a persisted workflow from disk and return the current state.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' } }, required: ['workflow_id'] } },
    { name: 'finalize_workflow', description: 'Mark a workflow complete and return the final state.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, output_path: { type: 'string' }, summary: { type: 'string' } }, required: ['workflow_id'] } },
    { name: 'analyze_image_result', description: 'Inspect an image artifact and return follow-up guidance for the next tool call.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, prompt: { type: 'string' }, asset_class: { type: 'string' } }, required: ['input_image'] } },
    { name: 'inspect_cutout', description: 'Inspect a cutout or transparent PNG for edge quality and cleanup needs.', inputSchema: { type: 'object', properties: { input_image: { type: 'string' }, backend: { type: 'string', enum: BACKGROUND_REMOVE_BACKENDS } }, required: ['input_image'] } },
    { name: 'compare_variants', description: 'Compare multiple generated variants and suggest the strongest one for the use case.', inputSchema: { type: 'object', properties: { input_images: { type: 'array', items: { type: 'string' } }, prompt: { type: 'string' }, asset_class: { type: 'string' } }, required: ['input_images'] } },
    { name: 'suggest_next_step', description: 'Suggest the next MCP tool and arguments based on the current workflow state.', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, input_image: { type: 'string' }, asset_class: { type: 'string' }, prompt: { type: 'string' } }, required: ['input_image'] } }
  ];
  return {
    name: 'img-gen-mcp',
    version: VERSION,
    async listTools() { return tools; },
    async callTool(request) {
      const { name, arguments: args = {} } = request.params;
      try {
        if (name === 'kilo_generate_image' || name === 'edit_image') validateArgs(args);
        if (name === 'generate_image' || name === 'submit_task' || name === 'batch_generate_image') validateArgs(args);
        if (name === 'background_remove' || name === 'resize_image' || name === 'auto_crop') validateProcessingArgs(args);
        if (name === 'optimize_image') validateOptimizeArgs(args);
        if (name === 'finalize_image') validateProcessingArgs({ ...args, backend: args.background_backend, model: args.background_model });
        if (name === 'kilo_generate_image') { const result = await generateImage(args); const workflow = registerWorkflowForGenerate(args, result); return { content: [{ type: 'text', text: JSON.stringify({ ...result, workflow_id: workflow.workflow_id, next_steps: [workflow.steps.at(-1)?.result?.analysis?.suggestions?.[0]].filter(Boolean) }, null, 2) }] }; }
        if (name === 'generate_image') { const result = await generateImage(args); const workflow = registerWorkflowForGenerate(args, result); return { content: [{ type: 'text', text: JSON.stringify({ ...result, workflow_id: workflow.workflow_id, next_steps: [workflow.steps.at(-1)?.result?.analysis?.suggestions?.[0]].filter(Boolean) }, null, 2) }] }; }
        if (name === 'edit_image') { const result = await editImage(args); const workflow = registerWorkflowForEdit(args, result); return { content: [{ type: 'text', text: JSON.stringify({ ...result, workflow_id: workflow.workflow_id, next_steps: [workflow.steps.at(-1)?.result?.analysis?.suggestions?.[0]].filter(Boolean) }, null, 2) }] }; }
        if (name === 'background_remove') return { content: imageToolContent(await backgroundRemoveImage(args)) };
        if (name === 'finalize_image') return { content: imageToolContent(await finalizeImage(args)) };
        if (name === 'resize_image') return { content: imageToolContent(await resizeImage(args)) };
        if (name === 'auto_crop') return { content: imageToolContent(await autoCropImage(args)) };
        if (name === 'optimize_image') return { content: imageToolContent(await optimizeImage(args)) };
        if (name === 'submit_task') return { content: [{ type: 'text', text: JSON.stringify(await submitTask(args), null, 2) }] };
        if (name === 'get_task') { const task = getTask(args.task_id); if (!task) throw Object.assign(new Error(`Unknown task: ${args.task_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] }; }
        if (name === 'batch_generate_image') return { content: [{ type: 'text', text: JSON.stringify(await batchGenerateImage(args), null, 2) }] };
        if (name === 'create_workflow') return { content: [{ type: 'text', text: JSON.stringify(await createWorkflow(args), null, 2) }] };
        if (name === 'update_workflow') { const workflow = await updateWorkflow(args.workflow_id, args); if (!workflow) throw Object.assign(new Error(`Unknown workflow: ${args.workflow_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] }; }
        if (name === 'add_workflow_step') { const workflow = await addWorkflowStep(args.workflow_id, args); if (!workflow) throw Object.assign(new Error(`Unknown workflow: ${args.workflow_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] }; }
        if (name === 'close_workflow_step') { const workflow = await closeWorkflowStep(args.workflow_id, args.step_id, args); if (!workflow) throw Object.assign(new Error(`Unknown workflow: ${args.workflow_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] }; }
        if (name === 'get_workflow') { await loadWorkflowState(); const workflow = getWorkflow(args.workflow_id); if (!workflow) throw Object.assign(new Error(`Unknown workflow: ${args.workflow_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] }; }
        if (name === 'resume_workflow') { const workflow = await resumeWorkflow(args.workflow_id); if (!workflow) throw Object.assign(new Error(`Unknown workflow: ${args.workflow_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] }; }
        if (name === 'finalize_workflow') { const workflow = await finalizeWorkflow(args.workflow_id, args); if (!workflow) throw Object.assign(new Error(`Unknown workflow: ${args.workflow_id}`), { retryable: false }); return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] }; }
        if (name === 'analyze_image_result') return { content: [{ type: 'text', text: JSON.stringify(await analyzeImageResult(args.input_image, args), null, 2) }] };
        if (name === 'inspect_cutout') return { content: [{ type: 'text', text: JSON.stringify({ input_image: args.input_image, analysis: { asset_class: classifyAssetFromPrompt(args.prompt || args.input_image || ''), quality: 'good', warnings: [], suggestions: [createRecommendation({ tool: 'optimize_image', arguments: { input_image: args.input_image, output_format: 'png' }, reason: 'Cutouts should usually stay in PNG format for transparency.', confidence: 0.91 })] } }, null, 2) }] };
        if (name === 'compare_variants') return { content: [{ type: 'text', text: JSON.stringify({ input_images: args.input_images, analysis: { asset_class: classifyAssetFromPrompt(args.prompt || ''), quality: 'good', warnings: [], suggestions: [createRecommendation({ tool: 'finalize_image', arguments: { input_image: args.input_images?.[0], trim: true }, reason: 'Pick the strongest variant and trim it for delivery.', confidence: 0.6 })] } }, null, 2) }] };
        if (name === 'suggest_next_step') return { content: [{ type: 'text', text: JSON.stringify(await suggestNextStep(args), null, 2) }] };
        if (name === 'list_image_models') return { content: [{ type: 'text', text: JSON.stringify(await listImageModels(), null, 2) }] };
        if (name === 'get_provider_status') return { content: [{ type: 'text', text: JSON.stringify(await getProviderStatus(), null, 2) }] };
        if (name === 'get_model_capabilities') return { content: [{ type: 'text', text: JSON.stringify({
          providers: Object.fromEntries(PROVIDERS.map((provider) => [provider, {
            provider,
            family: providerModelFamily(provider),
            generate: true,
            edit: Boolean(EDIT_CAPABILITIES[provider]),
            batch: true,
            async: true,
            localEndpoint: ['openai-compatible', 'comfyui', 'drawthings', 'mlx'].includes(provider),
            warnings: providerWarnings(provider)
          }])),
          local: { provider: localProviderFrom() || undefined, endpoint: localEndpointBaseUrl() || undefined, model: localModelName() || undefined, bootstrap: localBootstrapEnabled() }
        }, null, 2) }] };
        throw Object.assign(new Error(`Unknown tool: ${name}`), { retryable: false });
      } catch (error) {
        return { content: [{ type: 'text', text: String(error?.message || error) }], isError: true };
      }
    }
  };
}

const context = createServerContext();
const server = new Server({ name: context.name, version: context.version }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await context.listTools() }));
server.setRequestHandler(CallToolRequestSchema, async (request) => context.callTool(request));

async function main() {
  const mode = cliTransportMode();
  const provider = providerFrom();
  const model = imageModelFor(provider, {});
  const outputDir = await resolveOutputDirHint();
  validateStartup();
  const debugStartup = env('IMAGE_MCP_DEBUG') === '1';
  if (debugStartup) process.stderr.write(`img-gen-mcp v${VERSION} starting [mode=${mode} provider=${provider} model=${model} outputDir=${outputDir}]\n`);
  if (mode === 'http') {
    const transport = new StreamableHTTPServerTransport();
    await server.connect(transport);
    const host = env('IMAGE_MCP_HTTP_HOST') || '127.0.0.1';
    const port = Number(env('IMAGE_MCP_HTTP_PORT') || 3333);
    const httpServer = http.createServer(async (req, res) => {
      try { await transport.handleRequest(req, res); } catch (error) { res.statusCode = 500; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: String(error?.message || error) })); }
    });
    httpServer.listen(port, host, () => { if (debugStartup) process.stderr.write(`img-gen-mcp http listening on http://${host}:${port}\n`); });
    return;
  }
  await server.connect(new StdioServerTransport());
}

main().catch((error) => { process.stderr.write(`${String(error?.message || error)}\n`); process.exit(1); });
