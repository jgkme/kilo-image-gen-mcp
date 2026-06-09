# JGKME kilo-image-gen-mcp

MCP server for image generation through Kilo Gateway and compatible providers.

## Features

- `generate_image` for OpenRouter-first generation with response normalization
- `kilo_generate_image` for Kilo Gateway routing
- `edit_image` for prompt-driven image editing
- `background_remove` for local segmentation-backed transparent PNG cutouts
- `resize_image` and `auto_crop` for deterministic local transforms
- `finalize_image` for a one-call local workflow that can remove background, trim, crop, and resize
- Support for OpenAI `gpt-image-1`
- Gemini support for `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`, and `gemini-3-pro-image-preview`
- Global Kilo skills for generation, editing, background removal, and transforms
- Reusable smoke validation commands for OpenRouter, OpenAI, and local background removal
- Debug mode via `IMAGE_MCP_DEBUG=1` for full error details and response payloads
- `background_remove`, `resize_image`, `auto_crop`, and `finalize_image` work without any provider API key

## Install

```bash
npm install -g @jgkme/kilo-image-gen-mcp
```

## Configuration

Set the default provider with `IMAGE_MCP_DEFAULT_PROVIDER`.
Set the default model with `IMAGE_MCP_DEFAULT_MODEL`.
Set a project-specific image output root with `IMAGE_MCP_PROJECT_OUTPUT_DIR`.
Set `IMAGE_MCP_DEBUG=1` to include full error details, provider response payloads, and stack traces in MCP error output.
The local transform tools, background removal, and finalize workflow do not require provider keys. Only generation and edit routes need API keys.

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
| `purpose` | string | Optional. Helps normalize the prompt for a specific use case |
| `style` | string | Optional. Helps normalize the prompt's visual style |
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
| `purpose` | string | Optional. Helps normalize the prompt for a specific use case |
| `style` | string | Optional. Helps normalize the prompt's visual style |
| `input_image` | string | Optional reference image |
| `input_images` | string[] | Optional reference image list for OpenRouter chat-image models |
| `modalities` | string[] | Optional override, defaults to `['image', 'text']` for OpenRouter |
| `quality` | string | Optional OpenRouter image_config hint |
| `background` | string | Optional OpenRouter image_config hint |
| `output_format` | string | Optional OpenRouter image_config hint |
| `moderation` | string | Optional OpenRouter image_config hint |
| `output_path` | string | Optional output file path |

OpenRouter responses are normalized from `choices[0].message.images`, `message.content`, `data.output`, and other common image payload shapes. Multiple returned images are preserved.

Project output hint:

- If `IMAGE_MCP_PROJECT_OUTPUT_DIR` is set, the server writes generated images there.
- Otherwise, if the repo root contains `.image-mcp-output` or `.image-mcp-output.json`, that value is used.
- This is intended for project-specific layouts like Laravel `public/storage/images` without hardcoding framework detection.

Example hint file contents:

```text
public/storage/images
```

Or JSON:

```json
{ "outputDir": "public/storage/images" }
```

### `list_image_models`

Returns configured provider status, current defaults, and known model families.

### `get_provider_status`

Returns configured providers and defaults.

### `edit_image`

Same shape as `kilo_generate_image`, but requires `input_image` and routes the prompt as an edit instruction. Native edit routes are used for Kilo, OpenAI, and OpenRouter when available, with chat-based fallback for other providers.

### `background_remove`

Locally removes a background with a segmentation model and preserves transparency in a PNG output.

| Input | Type | Notes |
|---|---|---|
| `input_image` | string | Required |
| `backend` | string | Optional. `rmbg` for fast/default or `imgly` for higher quality |
| `model` | string | Optional. `u2netp`, `modnet`, or `briaai` |
| `max_resolution` | number | Optional. Defaults to `2048` |
| `output_path` | string | Optional output file path |

Backend notes:

- `rmbg` is the fast default and uses `u2netp`, `modnet`, or `briaai`
- `imgly` is the higher-quality path and uses `small` or `medium`
- Both backends run locally and do not need API keys
- Expect the quality backend to use more RAM and disk for model assets

Resource notes:

- CPU-only processing is fine for most images, but the quality backend may take longer on simple laptops
- Expect roughly 40 MB to 170 MB of model assets depending on the chosen backend/model
- GPU is optional; it helps if the host already has an accelerator, but it is not required

### `finalize_image`

One-call local workflow for cleanup and export.

| Input | Type | Notes |
|---|---|---|
| `input_image` | string | Required |
| `remove_background` | boolean | Optional. Run local background removal first |
| `background_backend` | string | Optional. `rmbg` or `imgly` |
| `background_model` | string | Optional. Backend-specific model name |
| `max_resolution` | number | Optional. Used by the background-removal step |
| `trim` | boolean | Optional. Trim transparent or empty borders |
| `width` / `height` | number | Optional. Resize target |
| `fit` | string | Optional. `cover`, `contain`, `fill`, `inside`, `outside` |
| `gravity` | string | Optional crop gravity |
| `background` | string | Optional flatten background color |
| `output_path` | string | Optional output file path |

Typical use: remove the background from a logo or product shot, then trim or resize it in the same call.

### `resize_image`

Locally resizes an image with aspect-ratio-preserving defaults.

| Input | Type | Notes |
|---|---|---|
| `input_image` | string | Required |
| `width` / `height` | number | Optional target dimensions |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, `outside` |
| `background` | string | Optional flatten background color |
| `output_path` | string | Optional output file path |

### `auto_crop`

Locally crops to target dimensions or trims surrounding whitespace when no size is provided.

| Input | Type | Notes |
|---|---|---|
| `input_image` | string | Required |
| `width` / `height` | number | Optional crop target |
| `gravity` | string | Optional crop gravity |
| `output_path` | string | Optional output file path |

## Behavior

- `provider` defaults to `IMAGE_MCP_DEFAULT_PROVIDER` or `kilo`
- `model` defaults to `IMAGE_MCP_DEFAULT_MODEL` when set, otherwise to the provider default
- `openai` defaults to `gpt-image-1`
- `generate_image` and `edit_image` add light prompt normalization when `purpose`, `style`, `aspect`, or `quality` are provided
- `aspect` maps to size when width and height are not provided
- `input_image` can be a file path, base64 string, or URL
- `output_path` writes the generated PNG to disk
- `generate_image` supports OpenRouter response normalization and multiple image payloads when present
- `edit_image` treats `input_image` as the reference image and preserves subject/composition unless instructed otherwise
- `edit_image` uses native edit endpoints for Kilo, OpenAI, and OpenRouter when possible
- `background_remove`, `resize_image`, and `auto_crop` are local deterministic tools that do not require provider API keys
- `background_remove` uses a local `rmbg` segmentation model by default and can switch to `imgly` for better edges
- `finalize_image` can chain local background removal, trim, crop, resize, and flatten in one call
- `IMAGE_MCP_DEBUG=1` expands tool error output with `details`, `response`, and `stack`

## Smoke tests

The repo includes a reusable validation script:

```bash
npm run smoke -- --provider openrouter --prompt "a colorful parrot perched on a branch"
npm run smoke -- --provider openai --prompt "a red panda wearing glasses" --purpose portrait
npm run smoke -- --tool background_remove --input-image generated-images/parrot.png --model modnet
npm run smoke -- --tool finalize_image --input-image generated-images/j-gemini-openrouter.png --remove-background true --background-backend imgly --background-model medium --trim true
```

Convenience commands are also available:

```bash
npm run smoke:openrouter
npm run smoke:openai
npm run smoke:bg
```

## Provider notes

- `kilo` uses `https://api.kilo.ai/api/gateway/images/generations`
- `openrouter` supports many image models, but not every model supports every modality combination. The server adapts the request shape per model and falls back to image-only when needed.
- `openai` uses `gpt-image-1` for generation and the Images API for edits
- `gemini` uses the OpenAI-compatible Gemini endpoint for generation and chat-style image flows where supported
- Errors return structured JSON text with `code`, `message`, `details`, and `retryable`
- For Kilo/OpenRouter, you can pick a different compatible model by setting `model` explicitly or by changing `IMAGE_MCP_DEFAULT_MODEL`
- In live Kilo runtime tests, the MCP can receive a non-empty `KILO_API_KEY`, but the Kilo image gateway still responds with `Please pass a valid API key` / `PAID_MODEL_AUTH_REQUIRED` for image generation requests. That indicates the backend is rejecting the token at the image endpoint, not that the MCP is dropping the key.
- Local image manipulation tools work without any provider API key after the model assets are installed or downloaded on first use.

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

If you need full provider payloads for debugging, set `IMAGE_MCP_DEBUG=1` in the MCP server environment and retry the same call.
