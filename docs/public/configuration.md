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

## Shared withoutBG daemon

Run the daemon once and reuse it across all MCP clients:

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```
