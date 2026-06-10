# Client Examples

`img-gen-mcp` works with any MCP client that can launch a local stdio server and pass environment variables.

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
