# Quickstart

## Install

```bash
npm install -g img-gen-mcp
```

## Minimal MCP config

```jsonc
{
  "mcp": {
    "img-gen-mcp": {
      "type": "local",
      "command": ["npx", "-y", "img-gen-mcp"],
      "enabled": true,
      "environment": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "openrouter",
        "IMAGE_MCP_DEFAULT_MODEL": "openai/gpt-image-1"
      }
    }
  }
}
```

## First run

Start with a simple prompt like:

```text
A clean studio portrait of a curly-fur dog, plain background, centered composition
```

If you want transparent cutouts, use `background_remove` or `finalize_image` after generation.
