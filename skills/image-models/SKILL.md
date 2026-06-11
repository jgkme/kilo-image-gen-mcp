---
name: image-models
description: Use img-gen-mcp model and provider guidance for OpenRouter, OpenAI, Gemini, local providers, and background-removal backends.
---

# Image Models And Backends

Use this skill when selecting or validating image generation models, local provider backends, and background-removal backends for img-gen-mcp.

## Supported OpenRouter image models

Prefer these slugs when prompting OpenRouter image generation:

- `microsoft/mai-image-2.5`
- `openai/gpt-image-1`
- `openai/gpt-5-image-mini`
- `openai/gpt-5.4-image-2`
- `google/gemini-2.5-flash-image`
- `google/gemini-2.5-flash-image-preview`
- `google/gemini-3-pro-image-preview`
- `x-ai/grok-imagine-image-quality`
- `bytedance-seed/seedream-4.5`
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

## Model notes

- `microsoft/mai-image-2.5` is a strong default for polished photorealistic output.
- `x-ai/grok-imagine-image-quality` is image-only and is good for realistic, prompt-faithful results.
- `openai/gpt-5-image-mini` is useful when lower latency is preferred.
- `sourceful/riverflow-*` models are often useful for stylized or prompt-following generation.
- `recraft/*` models are useful for logo/vector-style work.
- `provider=auto` can infer the backend from the model slug for common OpenAI, Gemini, OpenRouter, and local wrapper families.

## Discovery tools

- Use `list_image_models` to inspect provider families, defaults, and output directories.
- Use `get_provider_status` to check which providers are configured, the active defaults, and local bootstrap hints.
- Use `get_model_capabilities` to see which providers can generate, edit, batch, or use local endpoints.

## Workflow helpers

- Use `submit_task` and `get_task` when a client prefers polling instead of waiting synchronously.
- Use `batch_generate_image` when you want multiple variants from a single prompt.

## Local provider families

- `openai-compatible` for local `/v1` endpoints such as llama.cpp or LM Studio
- `comfyui` for workflow-driven local generation
- `drawthings` for the macOS bridge path
- `mlx` for local MLX-VLM-style endpoints on Apple Silicon

## Local background removal backends

Use these local backends when cleaning up generated PNGs:

- `rmbg` for the fastest lightweight local cutout
- `imgly` for higher quality local cutout
- `withoutbg` for the shared Docker daemon backend when you want the best local edge quality without duplicating model load per window

## When to choose what

- Use `rmbg` for fast, low-overhead cleanup.
- Use `imgly` for better logos, icons, and mixed-detail cutouts.
- Use `withoutbg` when fur, hair, transparency, or difficult edges need the best local quality and you want a shared daemon.

## Good practice

- Keep logo prompts simple and explicit about geometry, spacing, and no texture noise.
- Keep realistic-photo prompts explicit about lighting, material, and subject isolation.
- Use the repository's prompt enhancement flow when available so short prompts can be expanded deterministically before generation.
