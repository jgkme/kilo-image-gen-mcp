---
name: image-generation
description: Write strong prompts for this MCP's generate_image and kilo_generate_image tools, including model choice, aspect ratio, quality, purpose, and output path.
---

# Image Generation

Use this skill when the task is to create a new image with `generate_image` or `kilo_generate_image`.

## Prompt shape

Prefer a short structured prompt:

```text
Purpose: social post.
Style: clean editorial photo.
Aspect ratio: landscape.
Subject: a colorful parrot perched on a branch.
Scene: simple studio background with soft light.
Constraints: no text, no watermark, sharp focus.
```

## Tool guidance

- Use `generate_image` for OpenRouter-first flows.
- Use `kilo_generate_image` when you want the Kilo gateway provider selection.
- Set `quality` to `fast`, `balanced`, or `quality` when you want model routing to pick the cheapest or best fit.
- Set `model` only when you need a specific model override.
- Set `output_path` when you want a deterministic file path on disk.

## Good practice

- Keep the prompt focused on one image.
- Mention the subject, style, lighting, and composition.
- Add `purpose` when the image has a specific use case.
- Change one variable at a time when iterating.
