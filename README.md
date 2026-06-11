# img-gen-mcp

`img-gen-mcp` is a local-first MCP server for image generation, editing, async jobs, batch runs, background removal, optimization, and final asset delivery.

It now includes workflow-aware image guidance, persisted workflow state, and explicit step tracking so iterative image jobs can survive restarts and keep better server-side history.

It combines:
- OpenRouter-first image generation
- Kilo Gateway support
- OpenAI and Gemini image generation
- provider auto-selection and model-driven routing
- async task submission and polling
- batch image generation for prompt sweeps and variants
- local image generation through OpenAI-compatible endpoints and local bridges for MLX, ComfyUI, Draw Things, and llama.cpp-compatible servers
- Streamable HTTP transport via `IMAGE_MCP_TRANSPORT=http` and `npm run serve:http`
- local background cleanup with `rmbg`, `imgly`, and a shared Docker-backed `withoutbg` daemon
- web optimization with `sharp`
- deterministic prompt enhancement before generation

## Features

- `generate_image` for OpenRouter-first generation with response normalization
- `kilo_generate_image` for Kilo Gateway routing
- provider auto-selection through `provider=auto` or model-driven inference
- `list_image_models` for provider/model discovery with warnings and capability hints
- `get_provider_status` for backend readiness and local bootstrap guidance
- `get_model_capabilities` for a compact capability summary
- `edit_image` for prompt-driven image editing
- local provider support for OpenAI-compatible endpoints and local bridges like MLX, ComfyUI, and Draw Things
- `submit_task` and `get_task` for async generation workflows
- `batch_generate_image` for running multiple prompts in one request
- `create_workflow`, `update_workflow`, `get_workflow`, and `finalize_workflow` for iterative interactive jobs
- `add_workflow_step` and `close_workflow_step` for explicit workflow lifecycle tracking
- `resume_workflow` for continuing a persisted workflow after restart
- `analyze_image_result` and `suggest_next_step` for image-backed follow-up guidance
- `inspect_cutout` and `compare_variants` for specialized analysis helpers
- `background_remove` for local cutouts and the shared local withoutBG daemon
- `resize_image` and `auto_crop` for deterministic local transforms
- `optimize_image` for web-ready re-encoding and compression
- `finalize_image` for a one-call local workflow that can remove background, trim, crop, and resize
- alpha stats and multi-background inspection sheets for post-processing QA
- prompt enhancement before generation
- automatic web optimization after background removal/finalize
- debug mode via `IMAGE_MCP_DEBUG=1`

## Release Notes

- Workflow records are now persisted to `.image-mcp-workflows.json` and can be resumed after restart.
- `add_workflow_step` and `close_workflow_step` are available for explicit workflow lifecycle tracking.
- `analyze_image_result` and `suggest_next_step` now inspect the actual image file for structured guidance.

## Install

```bash
npm install -g img-gen-mcp
```

If you are running from a local checkout instead of npm, point your MCP client at `node /absolute/path/to/img-gen-mcp/server.js` rather than `npx`.

## Configuration

Use the correct launch command for your setup:

- Local checkout: `node /absolute/path/to/img-gen-mcp/server.js`
- Published package: `npx -y img-gen-mcp`
- HTTP transport: `IMAGE_MCP_TRANSPORT=http npm run serve:http`

Set these environment variables in your MCP client:

- `IMAGE_MCP_DEFAULT_PROVIDER` - default provider when none is supplied
- `IMAGE_MCP_DEFAULT_MODEL` - default model when none is supplied
- `IMAGE_MCP_PROJECT_OUTPUT_DIR` - optional project-specific output root
- `IMAGE_MCP_DEFAULT_BG_BACKEND` - default local cleanup backend (`rmbg`, `imgly`, or `withoutbg`)
- `WITHOUTBG_DAEMON_URL` - local daemon URL, defaults to `http://127.0.0.1:8765`
- `WITHOUTBG_AUTOSTART=1` - auto-start the shared withoutBG Docker daemon on demand
- `IMAGE_MCP_DEFAULT_BG_ALPHA_THRESHOLD` - tighter default mask for logos/header assets
- `IMAGE_MCP_PROMPT_ENHANCE=0` - disable deterministic prompt enhancement
- `IMAGE_MCP_DEBUG=1` - include detailed tool errors and provider payloads

Local model environment variables:

- `IMAGE_MCP_LOCAL_PROVIDER` - selects `openai-compatible`, `comfyui`, `drawthings`, or `mlx`
- `IMAGE_MCP_LOCAL_ENDPOINT` - local HTTP base URL
- `IMAGE_MCP_LOCAL_MODEL` - local model slug
- `IMAGE_MCP_LOCAL_AUTOSTART=1` - opt-in local service startup
- `IMAGE_MCP_LOCAL_BOOTSTRAP=1` - opt-in bootstrap helper mode
- `IMAGE_MCP_LOCAL_TIMEOUT_MS` - request timeout for local endpoints
- `IMAGE_MCP_LOCAL_API_KEY` - optional local auth token

Transport and runtime flags:

- `IMAGE_MCP_TRANSPORT=http` - opt in to Streamable HTTP transport
- `IMAGE_MCP_HTTP_HOST` - host for HTTP transport, defaults to `127.0.0.1`
- `IMAGE_MCP_HTTP_PORT` - port for HTTP transport, defaults to `3333`

HTTP transport example:

```bash
IMAGE_MCP_TRANSPORT=http npm run serve:http
```

Example MCP config for a local checkout:

```jsonc
{
  "mcp": {
    "img-gen-mcp": {
      "type": "local",
      "command": ["node", "/absolute/path/to/img-gen-mcp/server.js"],
      "enabled": true,
      "environment": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "openrouter",
        "IMAGE_MCP_DEFAULT_MODEL": "openai/gpt-image-1",
        "IMAGE_MCP_DEFAULT_BG_BACKEND": "imgly",
        "WITHOUTBG_DAEMON_URL": "http://127.0.0.1:8765",
        "WITHOUTBG_AUTOSTART": "1"
      }
    }
  }
}
```

Example MCP config for the published package:

```jsonc
{
  "mcp": {
    "img-gen-mcp": {
      "type": "local",
      "command": ["npx", "-y", "img-gen-mcp"],
      "enabled": true,
      "environment": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "openrouter",
        "IMAGE_MCP_DEFAULT_MODEL": "openai/gpt-image-1",
        "IMAGE_MCP_DEFAULT_BG_BACKEND": "imgly",
        "WITHOUTBG_DAEMON_URL": "http://127.0.0.1:8765",
        "WITHOUTBG_AUTOSTART": "1"
      }
    }
  }
}
```

Local examples:

```jsonc
{
  "mcp": {
    "img-gen-mcp": {
      "type": "local",
      "command": ["npx", "-y", "img-gen-mcp"],
      "enabled": true,
      "environment": {
        "IMAGE_MCP_LOCAL_PROVIDER": "mlx",
        "IMAGE_MCP_LOCAL_ENDPOINT": "http://127.0.0.1:8000/v1",
        "IMAGE_MCP_LOCAL_MODEL": "qwen3.5",
        "IMAGE_MCP_LOCAL_AUTOSTART": "1"
      }
    }
  }
}
```

See `docs/public/clients.md` for ready-to-use examples for Kilo, Cursor, and generic MCP clients.

## Guidance

- Use `provider=auto` when you want the server to infer the backend from a model slug.
- Use `submit_task` for long-running generations when your client prefers polling.
- Use `batch_generate_image` when you want multiple prompt variants without reconfiguring the client.
- Use `get_provider_status` before troubleshooting a local runtime so you can see the expected endpoint and startup hint.
- Use `IMAGE_MCP_LOCAL_BOOTSTRAP=1` when you want the server to print setup guidance for the configured local adapter.
- Use the workflow tools when you want the server to return a workflow ID and suggested next steps instead of stopping after one tool call.
- Run the workflow persistence regression test with `npm run test:workflow`.

Workflow tools:

- `create_workflow`
- `update_workflow`
- `get_workflow`
- `resume_workflow`
- `finalize_workflow`
- `analyze_image_result`
- `inspect_cutout`
- `compare_variants`
- `suggest_next_step`

## App Model Access

`img-gen-mcp` cannot automatically use the image models built into Cursor, Claude Code, or Codex.

It can only use a model source that is exposed to it as a separate provider or local HTTP endpoint.

| Client | Use built-in app image models directly? | What works |
|---|---|---|
| Cursor | No | Point `IMAGE_MCP_LOCAL_ENDPOINT` at a local image server or bridge |
| Claude Code | No | Point `IMAGE_MCP_LOCAL_ENDPOINT` at a local image server or bridge |
| Codex | No | Point `IMAGE_MCP_LOCAL_ENDPOINT` at a local image server or bridge |
| MLX / local server | Yes, if exposed as an endpoint | Set `IMAGE_MCP_LOCAL_PROVIDER=mlx` or `openai-compatible` |

If you want a zero-cloud setup, use a local backend such as MLX-VLM on macOS or an OpenAI-compatible local server like llama.cpp, LM Studio, ComfyUI, or a Draw Things bridge.

For local adapters, the package supports explicit `input_mode`, `input_image`, and `reference_image` flows so image-to-image and edit workflows can pass files or URLs directly.

## Workflow

The typical pipeline is:

1. Generate an image
2. Remove background if needed
3. Inspect the cutout on multiple backgrounds
4. Optimize the final asset for the web
5. Save and ship the final PNG/WebP/JPEG/AVIF

For complex generation work, prefer a model-first flow: pick a model, let `provider=auto` resolve the backend, then use async polling or batch generation if your client needs better control.

## Common Uses

- logos
- icons
- header artwork
- product photography
- realistic subject cutouts
- transparent PNG delivery

## Models

Supported OpenRouter image models include:
- `microsoft/mai-image-2.5`
- `openai/gpt-image-1`
- `openai/gpt-5-image-mini`
- `openai/gpt-5.4-image-2`
- `x-ai/grok-imagine-image-quality`
- `google/gemini-2.5-flash-image`
- `google/gemini-2.5-flash-image-preview`
- `google/gemini-3-pro-image-preview`
- `sourceful/riverflow-v2.5-fast`
- `sourceful/riverflow-v2.5-pro`
- `sourceful/riverflow-v2.5-fast:free`
- `sourceful/riverflow-v2-fast`
- `sourceful/riverflow-v2-pro`
- `recraft/recraft-v4.1-utility`
- `recraft/recraft-v4.1-vector`
- `recraft/recraft-v4.1-utility-pro`
- `recraft/recraft-v4.1-pro-vector`
- `recraft/recraft-v3`
- `black-forest-labs/flux.2-pro`
- `black-forest-labs/flux.2-flex`

Recommended defaults:
- Photorealistic work: `microsoft/mai-image-2.5` or `openai/gpt-image-1`
- Quick stylized work: `x-ai/grok-imagine-image-quality`
- Logos / vector-like work: `recraft/recraft-v4.1-vector`
- Broad prompt-following general use: `sourceful/riverflow-v2.5-pro`

## Local backends

- `openai-compatible` for any `/v1`-style local server
- `mlx` for macOS local model wrappers
- `comfyui` for workflow-driven generation
- `drawthings` for a running macOS app bridge
- `llama.cpp` for a lightweight local OpenAI-compatible endpoint

## Background Removal Backends

- `rmbg` - fastest lightweight local cleanup
- `imgly` - higher-quality local cleanup
- `withoutbg` - shared Docker-backed local daemon for harder edges, fur, and transparent cutouts

Start the shared daemon once:

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```

If `WITHOUTBG_AUTOSTART=1` is set, the MCP will try to start it automatically when `backend=withoutbg` is used.

## Web Optimization

`background_remove` and `finalize_image` automatically run a web optimization pass after cleanup.

Use `optimize_image` directly when you want explicit control:
- PNG for transparent cutouts
- WebP for opaque assets
- JPEG for flattened web images
- AVIF for aggressive compression

## Docs

- Public docs live in `docs/public/`
- Wiki-ready pages live in `docs/wiki/`
- Migration notes and setup details are documented there for public release
- The `list_image_models`, `get_provider_status`, and `get_model_capabilities` tools are documented there as part of the release-facing API surface

## Troubleshooting

- If `withoutbg` is not running, enable `WITHOUTBG_AUTOSTART=1` or start the daemon manually.
- If the model list looks wrong, set `IMAGE_MCP_DEFAULT_MODEL` explicitly.
- If image generation fails with provider-specific errors, verify the provider API key in your MCP environment.
- If you need the raw response details, set `IMAGE_MCP_DEBUG=1`.
