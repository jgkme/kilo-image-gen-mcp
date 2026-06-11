# img-gen-mcp Advanced Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the advanced capabilities commonly found in nearby image-generation MCP servers, in this order: provider auto-selection, local OpenAI-compatible bridges, MLX/ComfyUI/Draw Things/llama.cpp support, async jobs, batch generation, richer model/provider metadata, HTTP transport, and a local setup/bootstrap helper, then bump the version and release the package.

**Architecture:** Keep `server.js` as the core MCP implementation, but add narrowly scoped adapters and utilities around it so each feature remains testable on its own. The first phase will stabilize provider resolution and metadata, the second phase will expand local runtime support, then task orchestration features like async jobs and batching will be added, and finally transport/release plumbing will be layered on top. The release step should only happen after the new capabilities are validated and the public docs explain the new behavior clearly.

**Tech Stack:** Node.js ESM, MCP SDK, `axios`, `sharp`, optional Docker, optional Python/uv helpers, optional HTTP/SSE transport layer, existing smoke harness, npm packaging.

---

### Phase 1: Make provider selection and metadata smarter

This phase adds the lowest-risk improvements first so all later features have a stable selection layer.

### Task 1: Add provider auto-selection and capability metadata

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/models.md`
- Modify: `docs/public/overview.md`
- Modify: `docs/public/clients.md`
- Modify: `docs/wiki/Models.md`
- Modify: `docs/wiki/Home.md`
- Modify: `docs/wiki/Clients.md`

- [x] **Step 1: Add failing tests by defining the new model/status behavior in the docs and smoke harness**

Add these explicit expectations to the plan and docs:

```md
- `provider="auto"` selects the best provider from the requested model or local endpoint.
- `list_image_models` reports provider capabilities, model families, and warnings.
- `get_provider_status` reports the selected provider, endpoint, and whether local backends are configured.
```

Also add a smoke example showing model-driven provider selection:

```bash
node ./scripts/smoke-image.mjs --provider auto --model openai/gpt-image-1 --prompt 'a clean product shot'
```

- [x] **Step 2: Implement provider auto-selection in `server.js`**

Add helpers that infer provider from the model slug or local runtime settings:

```js
function providerFromModel(model) {
  const value = String(model || '').toLowerCase();
  if (value.startsWith('gpt-image-') || value.startsWith('dall-e-') || value.startsWith('openai/')) return 'openai';
  if (value.startsWith('google/gemini-') || value.startsWith('gemini-')) return 'gemini';
  if (value.startsWith('black-forest-labs/') || value.startsWith('x-ai/') || value.startsWith('recraft/') || value.startsWith('sourceful/')) return 'openrouter';
  return undefined;
}

function resolveProvider(args = {}) {
  const explicit = providerFrom(args.provider);
  if (explicit !== 'kilo' || String(args.provider || '').trim()) return explicit;
  const inferred = providerFromModel(args.model);
  return inferred || explicit;
}
```

Update the generation and edit entry points to use the resolved provider, not just the raw provider argument.

- [x] **Step 3: Expand provider metadata**

Update `listImageModels()` and `getProviderStatus()` so they include provider warnings and capability hints using this shape:

```js
{
  providers: {
    openrouter: { configured: true, endpoint: '...', generate: true, edit: true, warnings: [] },
    'openai-compatible': { configured: false, endpoint: '...', generate: true, edit: true, warnings: ['Requires a local OpenAI-compatible HTTP server'] }
  }
}
```

- [x] **Step 4: Validate the new selection path**

Run:

```bash
node --check server.js
```

Expected: no syntax errors, and provider resolution still works for `kilo`, `openrouter`, `openai`, and `gemini`.

---

### Phase 2: Make local providers actually useful

This phase covers the local bridge and runtime-specific local adapters together so users can run without cloud APIs.

### Task 2: Improve local OpenAI-compatible and MLX bridging

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/configuration.md`
- Modify: `docs/public/clients.md`
- Modify: `docs/public/troubleshooting.md`
- Modify: `docs/wiki/Configuration.md`
- Modify: `docs/wiki/Clients.md`
- Modify: `docs/wiki/Troubleshooting.md`

- [x] **Step 1: Add local endpoint health and timeout behavior**

Add a reusable local endpoint helper that caches health checks and respects a configurable timeout:

```js
async function localEndpointHealthy() {
  const url = localEndpointBaseUrl();
  if (!url) return false;
  const response = await axios.get(`${url.replace(/\/$/, '')}/health`, { timeout: localTimeoutMs() });
  return Boolean(response?.data?.ok ?? response?.status === 200);
}
```

- [x] **Step 2: Make local requests use the configured timeout and optional auth token**

In the local provider request path, only send an `Authorization` header when `IMAGE_MCP_LOCAL_API_KEY` is set. Make the request timeout use `IMAGE_MCP_LOCAL_TIMEOUT_MS`.

Use this structure for local chat-compatible calls:

```js
{
  model: imageModelFor(provider, args),
  messages,
  modalities: ['image', 'text']
}
```

- [x] **Step 3: Add MLX-specific configuration guidance**

Document an Apple Silicon workflow that uses:

```md
IMAGE_MCP_LOCAL_PROVIDER=mlx
IMAGE_MCP_LOCAL_ENDPOINT=http://127.0.0.1:8000/v1
IMAGE_MCP_LOCAL_MODEL=qwen3.5
```

Add a note that `ideogram-4.0` and `qwen-vl-8b` are examples of model slugs exposed through a local wrapper, not hardcoded server models.

- [x] **Step 4: Keep bridge support explicit in the docs**

Add a concise matrix in the README:

```md
- Cursor, Claude Code, Codex: cannot use built-in app models directly
- MLX / llama.cpp / LM Studio / ComfyUI / Draw Things: work if they expose a local endpoint
```

- [x] **Step 5: Validate the local path**

Run:

```bash
node --check server.js
node --check scripts/smoke-image.mjs
```

Expected: both files parse cleanly.

---

### Task 3: Add runtime-specific adapters for ComfyUI, Draw Things, and llama.cpp

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/backends.md`
- Modify: `docs/public/workflow.md`
- Modify: `docs/public/models.md`
- Modify: `docs/wiki/Backends.md`
- Modify: `docs/wiki/Workflow.md`
- Modify: `docs/wiki/Models.md`

- [x] **Step 1: Define ComfyUI, Draw Things, and llama.cpp adapter labels**

Use these adapter names consistently:

```md
- `comfyui`
- `drawthings`
- `llama.cpp`
```

- [x] **Step 2: Add adapter-specific endpoint defaults and warnings**

Implement local provider status entries that look like this:

```js
comfyui: {
  configured: selected === 'comfyui',
  endpoint: localEndpointBaseUrl() || 'http://127.0.0.1:8188',
  generate: true,
  edit: true,
  warnings: ['Requires a running ComfyUI HTTP server and a compatible workflow endpoint']
}
```

Do the same for Draw Things and llama.cpp with clear endpoint default hints and warning text.

- [x] **Step 3: Document local workflows by backend**

Add concrete examples for each backend:

```md
- ComfyUI: workflow-driven generation, img2img, inpainting, upscaling
- Draw Things: macOS bridge to a running local app service
- llama.cpp: OpenAI-compatible local server mode for PC/Linux
```

- [x] **Step 4: Verify the docs remain user-facing and specific**

Ensure the README and public docs say what each backend is good for, not just that it exists.

---

### Phase 3: Add async job support and batch generation

This phase adds workflow ergonomics similar to the better ComfyUI-oriented MCPs.

### Task 4: Add async task tools

**Files:**
- Modify: `server.js`
- Modify: `scripts/smoke-image.mjs`
- Modify: `README.md`
- Modify: `docs/public/workflow.md`
- Modify: `docs/public/clients.md`
- Modify: `docs/wiki/Workflow.md`
- Modify: `docs/wiki/Clients.md`

- [x] **Step 1: Add the async task tool contract**

Introduce these tools:

```md
- `submit_task`
- `get_task`
```

Define a task payload shape like this:

```js
{
  task_id: 'task_123',
  status: 'queued',
  provider: 'comfyui',
  model: 'qwen3.5',
  prompt: '...',
  created_at: '2026-06-10T12:00:00Z'
}
```

- [x] **Step 2: Implement an in-memory task registry**

Add a small queue map in `server.js` that stores task state and results during the process lifetime.

- [x] **Step 3: Make generation methods optionally async**

Allow `submit_task` to enqueue generation and return immediately, while `get_task` returns `queued`, `running`, `completed`, or `failed`.

- [x] **Step 4: Extend the smoke harness**

Add a smoke mode that exercises `submit_task` followed by `get_task` until completion.

- [x] **Step 5: Validate**

Run:

```bash
node --check server.js
```

Expected: async job tools are registered and callable.

### Task 5: Add batch generation support

**Files:**
- Modify: `server.js`
- Modify: `scripts/smoke-image.mjs`
- Modify: `README.md`
- Modify: `docs/public/workflow.md`
- Modify: `docs/wiki/Workflow.md`

- [x] **Step 1: Define batch input and output shape**

Add a batch tool with this shape:

```js
{
  prompt: '...',
  count: 4,
  provider: 'openrouter',
  model: 'recraft/recraft-v4.1-vector',
  output_path: './generated-images/batch'
}
```

Return an array of image results and ensure filenames are unique.

- [x] **Step 2: Implement batch orchestration in `server.js`**

Reuse the existing generation helpers in a loop and preserve deterministic naming.

- [x] **Step 3: Update the smoke harness**

Add a batch smoke path that generates at least two outputs and checks that both files exist.

- [x] **Step 4: Document when batch mode is useful**

Focus the docs on variant exploration, prompt sweeps, and local model comparison.

---

### Phase 4: Improve image workflows and model catalogs

This phase makes the server more competitive with the projects that expose rich workflows and model metadata.

### Task 6: Add image-to-image, inpainting, and prompt/image upload helpers

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/workflow.md`
- Modify: `docs/public/clients.md`
- Modify: `docs/wiki/Workflow.md`
- Modify: `docs/wiki/Clients.md`

- [x] **Step 1: Add clear input modes**

Support explicit input modes for:

```md
- text-to-image
- image-to-image
- inpainting/outpainting
- local file upload
- remote image URL
```

- [x] **Step 2: Add a helper for reference-image uploads**

Make it easy for MCP clients to pass local files or URLs into ComfyUI and OpenAI-compatible local paths.

- [x] **Step 3: Document the workflow patterns**

Add specific examples for logos, product shots, and local ComfyUI refinement.

### Task 7: Add richer model/provider metadata

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/models.md`
- Modify: `docs/public/overview.md`
- Modify: `docs/wiki/Models.md`
- Modify: `docs/wiki/Home.md`

- [x] **Step 1: Expand `list_image_models` with warnings and families**

Add provider warnings, family tags, and local runtime hints for each provider.

- [x] **Step 2: Add a `get_model_capabilities`-style summary**

Expose a concise endpoint or tool result that says which providers can generate, edit, batch, or use local endpoints.

- [x] **Step 3: Document the recommended defaults**

Make the docs specific:

```md
- Photorealistic: OpenAI or OpenRouter routes
- Logos/vector marks: Recraft
- Local macOS experimentation: MLX-VLM
- Workflow-heavy generation: ComfyUI
```

---

### Phase 5: Add an HTTP transport and a local setup helper

This phase addresses the friction other projects reduce with HTTP serving and setup aids.

### Task 8: Add HTTP transport support

**Files:**
- Modify: `server.js`
- Create: `scripts/serve-http.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/public/quickstart.md`
- Modify: `docs/public/configuration.md`
- Modify: `docs/wiki/Getting-Started.md`
- Modify: `docs/wiki/Configuration.md`

- [x] **Step 1: Define the HTTP server entrypoint**

Add an HTTP transport mode that exposes the same MCP tools over HTTP for remote/self-hosted usage.

- [x] **Step 2: Keep stdio as the default**

Do not change the current stdio behavior; HTTP should be opt-in.

- [x] **Step 3: Add examples to the README**

Show how to run local and HTTP modes side by side.

### Task 9: Add a local setup/bootstrap helper

**Files:**
- Create: `scripts/bootstrap-local-runtime.mjs`
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/configuration.md`
- Modify: `docs/public/troubleshooting.md`
- Modify: `docs/wiki/Configuration.md`
- Modify: `docs/wiki/Troubleshooting.md`

- [x] **Step 1: Define bootstrap intent**

The helper should print the exact command needed to start the selected local runtime, and only run it if the user opted in.

- [x] **Step 2: Add backend-specific bootstrap hints**

Document commands for:

```bash
uv run python -m mlx_vlm.server --host 127.0.0.1 --port 8000
python -m llama_cpp.server --host 127.0.0.1 --port 8080
```

- [x] **Step 3: Keep Draw Things conservative**

Only emit a connection hint for Draw Things; do not try to install or launch the app.

---

### Phase 6: Validate, bump version, and release

This is the final phase and should only happen after the new behavior is documented and smoke-tested.

### Task 10: Expand the smoke suite and validate packaging

**Files:**
- Modify: `scripts/smoke-image.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [x] **Step 1: Add smoke coverage for local, async, and batch paths**

Add smoke modes for:

```md
- local OpenAI-compatible endpoint
- MLX provider
- async task submission and polling
- batch generation
```

- [x] **Step 2: Verify package contents**

Run:

```bash
npm pack --dry-run
```

Expected: runtime files only, no plan files, no scratch docs.

- [x] **Step 3: Verify syntax**

Run:

```bash
node --check server.js
node --check scripts/smoke-image.mjs
```

### Task 11: Bump the version number and cut a release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server.js`
- Modify: `README.md`
- Modify: `docs/public/*`
- Modify: `docs/wiki/*`

- [x] **Step 1: Choose the next semver version**

Bump the patch or minor version depending on the breadth of the implementation. Since this adds multiple user-facing capabilities, prefer a minor bump if the current release series allows it.

- [x] **Step 2: Update package metadata**

Change the version in both `package.json` and `package-lock.json`, and update the `VERSION` constant in `server.js` to match.

- [x] **Step 3: Update any release-facing docs**

Make sure the README install/config examples still match the published package name and versioned behavior.

- [ ] **Step 4: Tag or publish the release**

Use the repository’s normal release mechanism to publish the new version after the commit is validated.

- [ ] **Step 5: Commit the release changes**

Use a message such as:

```bash
git commit -m "chore: release advanced image capabilities"
```

---

## Self-Review

### Spec coverage

- Provider auto-selection and metadata are covered in Phase 1.
- Local bridges and runtime-specific adapters are covered in Phases 2 and 3.
- Async jobs and batch generation are covered in Phase 3.
- Workflow helpers and richer metadata are covered in Phase 4.
- HTTP transport and bootstrap helpers are covered in Phase 5.
- Version bump and release are covered in Phase 6.

### Placeholder scan

- No placeholder-only tasks remain.
- Every task has explicit files, commands, and expected outputs.

### Type consistency

- Provider names are consistent: `auto`, `openai-compatible`, `comfyui`, `drawthings`, `mlx`, `kilo`, `openrouter`, `openai`, `gemini`.
- Local helper env vars remain consistent with the current repo convention.
- New task names do not rely on undefined helper functions.
