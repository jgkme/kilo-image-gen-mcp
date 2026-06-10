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

## Shared daemon setup

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```

## Autostart

If `WITHOUTBG_AUTOSTART=1` is set, the MCP will try to start the shared daemon when a `withoutbg` job needs it.
