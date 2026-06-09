# JGKME kilo-image-gen-mcp

MCP server for image generation through Kilo Gateway and compatible providers.

## Install

```bash
npm install -g @jgkme/kilo-image-gen-mcp
```

## Configuration

Set the default provider with `IMAGE_MCP_DEFAULT_PROVIDER`.

Provider environment variables:

| Provider | Variable |
|---|---|
| Kilo | `KILO_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` |

## Tools

### `kilo_generate_image`

| Input | Type | Notes |
|---|---|---|
| `prompt` | string | Required |
| `provider` | string | `kilo`, `openrouter`, `openai`, `gemini` |
| `model` | string | Defaults to `black-forest-labs/flux.2-pro` |
| `size` | string | Example `1024x1024` |
| `width` / `height` | number | Overrides `size` |
| `aspect` | string | `square`, `landscape`, `portrait` |
| `steps` | number | Optional |
| `input_image` | string | Path, base64, or URL |
| `output_path` | string | Optional output file |

### `list_image_models`

Returns configured provider status and current defaults.

### `get_provider_status`

Returns configured providers and defaults.

## Behavior

- `provider` defaults to `IMAGE_MCP_DEFAULT_PROVIDER` or `kilo`
- `aspect` maps to size when width and height are not provided
- `input_image` can be a file path, base64 string, or URL
- `output_path` writes the generated PNG to disk

## Provider notes

- `kilo` uses `https://api.kilo.ai/api/gateway/images/generations`
- `openrouter`, `openai`, and `gemini` use chat-completions image flows when available
- Errors return structured JSON text with `code`, `message`, `details`, and `retryable`

## Kilo config

```json
{
  "mcp": {
  "kilo-image-gen": {
      "type": "local",
      "command": ["npx", "-y", "@jgkme/kilo-image-gen-mcp"],
      "env": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "kilo",
        "KILO_API_KEY": "your_kilo_api_key_here",
        "OPENROUTER_API_KEY": "your_openrouter_api_key_here",
        "OPENAI_API_KEY": "your_openai_api_key_here",
        "GEMINI_API_KEY": "your_gemini_api_key_here"
      },
      "enabled": true
    }
  }
}
```

## Troubleshooting

If generation fails, verify the provider API key and model name. If no output file is written, confirm `output_path` points to a writable location.
