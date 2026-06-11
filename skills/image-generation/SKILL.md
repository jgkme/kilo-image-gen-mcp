---
name: image-generation
description: Use img-gen-mcp generation tools to create new images with prompt structure, provider choice, model choice, aspect ratio, and output path.
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

- Use `generate_image` for normal provider routing.
- Use `kilo_generate_image` when you want the Kilo gateway route.
- Set `provider=auto` when the model slug should determine the backend.
- Set `quality` to `fast`, `balanced`, or `quality` when you want routing to bias speed or fidelity.
- Set `model` only when you need a specific model override.
- Set `output_path` when you want a deterministic file path on disk.
- For logo, favicon, or website asset work, switch to the `website-asset-workflow` skill so generation is paired with crop, background removal, and optimization guidance.
- For sprite sheets, transparent frames, or game UI assets, switch to the `sprite-workflow` skill so generation stays focused on readable small-scale assets and game-ready exports.

## Good practice

- Keep the prompt focused on one image.
- Mention the subject, style, lighting, and composition.
- Add `purpose` when the image has a specific use case.
- Change one variable at a time when iterating.
