# img-gen-mcp

`img-gen-mcp` is a local-first MCP server for image generation, editing, background removal, optimization, and final asset delivery.

It combines:
- OpenRouter-first image generation
- Kilo Gateway support
- OpenAI and Gemini image generation
- local image generation through OpenAI-compatible endpoints and local bridges for MLX, ComfyUI, Draw Things, and llama.cpp-compatible servers
- local background cleanup with `rmbg`, `imgly`, and a shared Docker-backed `withoutbg` daemon
- web optimization with `sharp`
- deterministic prompt enhancement before generation

## Features

- `generate_image` for OpenRouter-first generation with response normalization
- `kilo_generate_image` for Kilo Gateway routing
- `edit_image` for prompt-driven image editing
- local provider support for OpenAI-compatible endpoints and local bridges like MLX, ComfyUI, and Draw Things
- `background_remove` for local cutouts and the shared local withoutBG daemon
- `resize_image` and `auto_crop` for deterministic local transforms
- `optimize_image` for web-ready re-encoding and compression
- `finalize_image` for a one-call local workflow that can remove background, trim, crop, and resize
- alpha stats and multi-background inspection sheets for post-processing QA
- prompt enhancement before generation
- automatic web optimization after background removal/finalize
- debug mode via `IMAGE_MCP_DEBUG=1`

## Install

```bash
npm install -g img-gen-mcp
```

## Configuration

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

Example MCP config:

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

## Workflow

The typical pipeline is:

1. Generate an image
2. Remove background if needed
3. Inspect the cutout on multiple backgrounds
4. Optimize the final asset for the web
5. Save and ship the final PNG/WebP/JPEG/AVIF

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

- Public docs drafts live in `docs/public/`
- Wiki-ready pages live in `docs/wiki/`
- Migration notes and setup details are documented there for public release

## Troubleshooting

- If `withoutbg` is not running, enable `WITHOUTBG_AUTOSTART=1` or start the daemon manually.
- If the model list looks wrong, set `IMAGE_MCP_DEFAULT_MODEL` explicitly.
- If image generation fails with provider-specific errors, verify the provider API key in your MCP environment.
- If you need the raw response details, set `IMAGE_MCP_DEBUG=1`.
