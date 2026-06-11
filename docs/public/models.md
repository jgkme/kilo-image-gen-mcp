# Models

## Supported OpenRouter models

- `microsoft/mai-image-2.5`
- `openai/gpt-image-1`
- `openai/gpt-5-image-mini`
- `openai/gpt-5.4-image-2`
- `x-ai/grok-imagine-image-quality`
- `google/gemini-2.5-flash-image`
- `google/gemini-2.5-flash-image-preview`
- `google/gemini-3-pro-image-preview`
- `sourceful/riverflow-v2.5-fast:free`
- `sourceful/riverflow-v2.5-fast`
- `sourceful/riverflow-v2.5-pro`
- `sourceful/riverflow-v2-fast`
- `sourceful/riverflow-v2-pro`
- `recraft/recraft-v4.1-utility`
- `recraft/recraft-v4.1-vector`
- `recraft/recraft-v4.1-utility-pro`
- `recraft/recraft-v4.1-pro-vector`
- `recraft/recraft-v3`
- `black-forest-labs/flux.2-pro`
- `black-forest-labs/flux.2-flex`

## Local model examples

These are example slugs users may expose through a local provider or wrapper:

- `z-image-turbo`
- `flux.1-schnell`
- `ideogram-4.0`
- `qwen-vl-8b`
- `qwen3.5`

## Suggested defaults

- Photorealistic subjects: `microsoft/mai-image-2.5` or `openai/gpt-image-1`
- Fast stylized concepts: `x-ai/grok-imagine-image-quality`
- Logos and vector-like marks: `recraft/recraft-v4.1-vector`
- Balanced general generation: `sourceful/riverflow-v2.5-pro`
- Local macOS experimentation: `qwen3.5` or `ideogram-4.0` via MLX

## Notes

- The model list is intentionally explicit so the CLI and docs stay predictable.
- Provider availability can still vary by account, OpenRouter routing, and local runtime wrapper.
- `list_image_models` now reports provider families, warnings, and capability hints for local versus cloud backends.
- `provider=auto` uses model inference first, then falls back to the configured default provider.
- `get_model_capabilities` summarizes whether a model is generation-only, edit-capable, local-friendly, or better suited to image-to-image workflows.
