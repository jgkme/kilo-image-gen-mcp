# Backends

## `rmbg`

- Fastest local cleanup path
- Good default when you want low overhead
- Best for quick subject isolation and batch work

## `imgly`

- Higher quality local cleanup
- Better for logos, icons, and more careful edge handling
- Still fully local and no API key required

## `withoutbg`

- Shared Docker-backed local daemon
- Best for difficult edges like fur, hair, and transparency-heavy subjects
- Reuses one model load across all VS Code / Kilo instances on the machine

## Local generation backends

- `openai-compatible` - any local server exposing `/v1/chat/completions` or similar OpenAI-style endpoints
- `mlx` - MLX-VLM on macOS
- `comfyui` - ComfyUI with a local HTTP workflow endpoint
- `drawthings` - Draw Things on macOS
- `llama.cpp` - local server mode on PC/Linux

## Backend notes

- `comfyui` is best for workflow-heavy generation, image-to-image, and future inpainting/outpainting paths.
- `drawthings` is the simplest macOS bridge when you want to drive a running app from MCP.
- `llama.cpp` and similar local OpenAI-compatible servers are the easiest fit when you already have a `/v1` endpoint.
- `mlx` is the Apple Silicon path for local experimentation with model wrappers that expose image-capable endpoints.

## Shared daemon setup

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```

## Autostart

If `WITHOUTBG_AUTOSTART=1` is set, the MCP will try to start the shared daemon when a `withoutbg` job needs it.

## Local bootstrap helper

If `IMAGE_MCP_LOCAL_BOOTSTRAP=1` is set, the server reports setup instructions for the selected local backend in `get_provider_status`.

- `openai-compatible`: point the endpoint at a local `/v1` server such as llama.cpp or LM Studio
- `mlx`: install and start your MLX wrapper, then point the endpoint at it
- `comfyui`: expose a workflow endpoint and point the server at it
- `drawthings`: start the local bridge endpoint and point the server at it
