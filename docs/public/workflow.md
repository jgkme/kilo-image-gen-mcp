# Workflow

The standard pipeline is:

```text
generate -> background_remove/finalize -> inspect -> optimize -> deliver
```

## Common paths

- **Logo / icon:** generate -> `background_remove` with `imgly` or `withoutbg` -> inspect -> `optimize_image`
- **Photoreal subject:** generate -> `background_remove` -> inspect -> `optimize_image`
- **Web-ready banner:** generate -> `finalize_image` -> `optimize_image`
- **Local MLX experiment:** generate with `IMAGE_MCP_LOCAL_PROVIDER=mlx` -> refine prompt -> save local PNG
- **Local open endpoint:** connect to a user-owned OpenAI-compatible server -> generate -> post-process locally
- **Async generation:** `submit_task` -> poll `get_task` until `completed` -> use the returned `output_path`
- **Prompt sweeps:** `batch_generate_image` -> compare the returned files for the strongest variant
- **Reference image edit:** `edit_image` with `input_mode=image-to-image` and a local file or URL in `input_image`
- **Remote reference:** pass an `http(s)` URL in `input_image` or `reference_image` when the backend accepts remote fetches
- **Local upload:** pass a local file path in `input_image` or `reference_image` for one-shot generation or edits

## Decision guide

- Use `submit_task` when the request is long-running and your client prefers polling.
- Use `batch_generate_image` when you want several prompt variants back from one request.
- Use `provider=auto` when the model slug already implies the backend family.
- Use `get_provider_status` before switching local runtimes so you can verify endpoint, model, and bootstrap guidance.

## Inspection

`background_remove` and `finalize_image` emit multi-background inspection sheets to make halos and matte residue easier to spot.

## Optimization

`background_remove` and `finalize_image` already auto-optimize their output. Use `optimize_image` directly when you want explicit control over PNG, WebP, JPEG, or AVIF output.
