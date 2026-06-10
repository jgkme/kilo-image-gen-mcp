# Configuration

## Environment variables

| Variable | Purpose |
|---|---|
| `IMAGE_MCP_DEFAULT_PROVIDER` | Default generation provider |
| `IMAGE_MCP_DEFAULT_MODEL` | Default image model |
| `IMAGE_MCP_PROJECT_OUTPUT_DIR` | Project-specific output folder |
| `IMAGE_MCP_DEFAULT_BG_BACKEND` | Default cleanup backend (`rmbg`, `imgly`, `withoutbg`) |
| `WITHOUTBG_DAEMON_URL` | Shared withoutBG daemon URL |
| `WITHOUTBG_AUTOSTART` | Auto-start the shared withoutBG daemon |
| `IMAGE_MCP_DEFAULT_BG_ALPHA_THRESHOLD` | Logo/header cleanup threshold |
| `IMAGE_MCP_PROMPT_ENHANCE` | Enable/disable deterministic prompt enhancement |
| `IMAGE_MCP_DEBUG` | Verbose errors and payloads |
| `IMAGE_MCP_LOCAL_PROVIDER` | Local provider adapter (`openai-compatible`, `comfyui`, `drawthings`, `mlx`) |
| `IMAGE_MCP_LOCAL_ENDPOINT` | Local HTTP base URL |
| `IMAGE_MCP_LOCAL_MODEL` | Local model slug |
| `IMAGE_MCP_LOCAL_AUTOSTART` | Opt-in local service startup |
| `IMAGE_MCP_LOCAL_BOOTSTRAP` | Opt-in bootstrap helper mode |
| `IMAGE_MCP_LOCAL_TIMEOUT_MS` | Request timeout for local endpoints |
| `IMAGE_MCP_LOCAL_API_KEY` | Optional local auth token |

## Example MCP config

```jsonc
{
  "environment": {
    "IMAGE_MCP_DEFAULT_PROVIDER": "openrouter",
    "IMAGE_MCP_DEFAULT_MODEL": "openai/gpt-image-1",
    "IMAGE_MCP_DEFAULT_BG_BACKEND": "imgly",
    "WITHOUTBG_DAEMON_URL": "http://127.0.0.1:8765",
    "WITHOUTBG_AUTOSTART": "1"
  }
}
```

## Local MLX config

```jsonc
{
  "environment": {
    "IMAGE_MCP_LOCAL_PROVIDER": "mlx",
    "IMAGE_MCP_LOCAL_ENDPOINT": "http://127.0.0.1:8000/v1",
    "IMAGE_MCP_LOCAL_MODEL": "qwen3.5",
    "IMAGE_MCP_LOCAL_AUTOSTART": "1",
    "IMAGE_MCP_LOCAL_BOOTSTRAP": "1"
  }
}
```

## Shared withoutBG daemon

Run the daemon once and reuse it across all MCP clients:

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```
