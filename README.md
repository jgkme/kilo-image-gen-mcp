# JGKME kilo-image-gen-mcp

MCP server for image generation through Kilo Gateway and compatible providers.

## Install

```bash
npm install -g @jgkme/kilo-image-gen-mcp
```

## Configuration

Set the default provider with `IMAGE_MCP_DEFAULT_PROVIDER`.
Set the default model with `IMAGE_MCP_DEFAULT_MODEL`.

For MCP clients, use whatever field name the client expects for process environment variables. In Kilo, the working key is `env` for local MCP servers. Some other clients use `environment` or similar, but the server itself only reads standard process environment variables.

Provider environment variables:

| Provider | Variable |
|---|---|
| Kilo | `KILO_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` |

Default model notes:

- If `IMAGE_MCP_DEFAULT_MODEL` is set, the server uses that model when `model` is omitted.
- Otherwise, the default follows the selected provider.
- Kilo Gateway can route to other compatible models if your account has access to them.

## Tools

### `kilo_generate_image`

| Input | Type | Notes |
|---|---|---|
| `prompt` | string | Required |
| `provider` | string | `kilo`, `openrouter`, `openai`, `gemini` |
| `model` | string | Optional. Defaults from `IMAGE_MCP_DEFAULT_MODEL` or provider default |
| `size` | string | Example `1024x1024` |
| `width` / `height` | number | Overrides `size` |
| `aspect` | string | `square`, `landscape`, `portrait` |
| `steps` | number | Optional |
| `input_image` | string | Path, base64, or URL |
| `output_path` | string | Optional output file |

### `generate_image`

OpenRouter-first image generation tool with broader request options and response normalization.

| Input | Type | Notes |
|---|---|---|
| `prompt` | string | Required |
| `provider` | string | Defaults to `openrouter` if omitted |
| `model` | string | Optional |
| `input_image` | string | Optional reference image |
| `input_images` | string[] | Optional reference image list for OpenRouter chat-image models |
| `modalities` | string[] | Optional override, defaults to `['image', 'text']` for OpenRouter |
| `quality` | string | Optional OpenRouter image_config hint |
| `background` | string | Optional OpenRouter image_config hint |
| `output_format` | string | Optional OpenRouter image_config hint |
| `moderation` | string | Optional OpenRouter image_config hint |
| `output_path` | string | Optional output file path |

OpenRouter responses are normalized from `choices[0].message.images`, `message.content`, `data.output`, and other common image payload shapes. Multiple returned images are preserved.

### `list_image_models`

Returns configured provider status, current defaults, and known model families.

### `get_provider_status`

Returns configured providers and defaults.

### `edit_image`

Same shape as `kilo_generate_image`, but requires `input_image` and routes the prompt as an edit instruction. Native edit routes are used for Kilo, OpenAI, and OpenRouter when available, with chat-based fallback for other providers.

## Behavior

- `provider` defaults to `IMAGE_MCP_DEFAULT_PROVIDER` or `kilo`
- `model` defaults to `IMAGE_MCP_DEFAULT_MODEL` when set, otherwise to the provider default
- `aspect` maps to size when width and height are not provided
- `input_image` can be a file path, base64 string, or URL
- `output_path` writes the generated PNG to disk
- `generate_image` supports OpenRouter response normalization and multiple image payloads when present
- `edit_image` treats `input_image` as the reference image and preserves subject/composition unless instructed otherwise
- `edit_image` uses native edit endpoints for Kilo, OpenAI, and OpenRouter when possible

## Provider notes

- `kilo` uses `https://api.kilo.ai/api/gateway/images/generations`
- `openrouter`, `openai`, and `gemini` use chat-completions image flows when available
- Errors return structured JSON text with `code`, `message`, `details`, and `retryable`
- For Kilo/OpenRouter, you can pick a different compatible model by setting `model` explicitly or by changing `IMAGE_MCP_DEFAULT_MODEL`
- In live Kilo runtime tests, the MCP can receive a non-empty `KILO_API_KEY`, but the Kilo image gateway still responds with `Please pass a valid API key` / `PAID_MODEL_AUTH_REQUIRED` for image generation requests. That indicates the backend is rejecting the token at the image endpoint, not that the MCP is dropping the key.

## Kilo config

```json
{
  "mcp": {
    "kilo-image-gen": {
      "type": "local",
      "command": ["npx", "-y", "@jgkme/kilo-image-gen-mcp"],
      "env": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "kilo",
        "IMAGE_MCP_DEFAULT_MODEL": "black-forest-labs/flux.2-pro",
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

If you are using another MCP client such as Cursor, continue using the same process environment variable names (`KILO_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`), but match that client’s config schema for local server env injection. The key point is that the launched process must receive those variables in its runtime environment.

For a local install path, use:

```json
{
  "mcp": {
    "kilo-image-gen": {
      "type": "local",
      "command": ["npx", "-y", "@jgkme/kilo-image-gen-mcp"],
      "env": {
        "IMAGE_MCP_DEFAULT_PROVIDER": "kilo",
        "IMAGE_MCP_DEFAULT_MODEL": "black-forest-labs/flux.2-pro",
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
