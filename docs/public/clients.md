# Client Examples

`img-gen-mcp` works with any MCP client that can launch a local stdio server and pass environment variables.

## App model access

The server cannot directly borrow image models that live inside Cursor, Claude Code, or Codex.

Those apps must expose a separate local endpoint before `img-gen-mcp` can use them.

If you want the server to infer a provider from the model slug, use `provider=auto` and pass a model such as `openai/gpt-image-1`, `google/gemini-2.5-flash-image`, or a local wrapper slug.

| Client | Built-in app models | Works with `img-gen-mcp` |
|---|---|---|
| Cursor | No direct access | Yes, through a local endpoint or bridge |
| Claude Code | No direct access | Yes, through a local endpoint or bridge |
| Codex | No direct access | Yes, through a local endpoint or bridge |
| MLX / local server | Yes, if exposed as HTTP | Yes, with `IMAGE_MCP_LOCAL_PROVIDER=mlx` |

For local-only use, a bridge or endpoint is the right path: MLX-VLM on macOS, llama.cpp server mode, LM Studio, ComfyUI bridges, or Draw Things bridges.

The tools `list_image_models`, `get_provider_status`, and `get_model_capabilities` expose warnings and capability hints so clients can display whether a provider is cloud-backed or local.

## Kilo

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
        "WITHOUTBG_AUTOSTART": "1"
      }
    }
  }
}
```

## Cursor

```jsonc
{
  "mcpServers": {
    "img-gen-mcp": {
      "command": "npx",
      "args": ["-y", "img-gen-mcp"],
      "env": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "openrouter",
        "IMAGE_MCP_DEFAULT_MODEL": "openai/gpt-image-1",
        "WITHOUTBG_AUTOSTART": "1"
      }
    }
  }
}
```

## Generic MCP client

```jsonc
{
  "mcpServers": {
    "img-gen-mcp": {
      "command": "npx",
      "args": ["-y", "img-gen-mcp"],
      "env": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "openrouter",
        "IMAGE_MCP_DEFAULT_MODEL": "openai/gpt-image-1"
      }
    }
  }
}
```

## Local MLX client example

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
        "IMAGE_MCP_LOCAL_AUTOSTART": "1",
        "IMAGE_MCP_LOCAL_BOOTSTRAP": "1"
      }
    }
  }
}
```

## Notes

- Some clients use `environment` instead of `env`.
- The server only reads standard process environment variables.
- Set provider API keys in the same environment block.
- If your client supports long-running polling, prefer `submit_task` and `get_task` for larger generations.
- If your client supports multiple invocations in one workflow, `batch_generate_image` is the cleanest way to compare prompt variants.
