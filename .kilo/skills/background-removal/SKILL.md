---
name: background-removal
description: Use this MCP's background_remove tool with local segmentation models and transparent PNG output.
---

# Background Removal

Use this skill when the task is to remove a background from an image with `background_remove`.

## Tool guidance

- Use `input_image` for the source image.
- Use `output_path` to save the transparent PNG to a known location.
- Use `model` to choose the local segmentation model.
- Supported local models:
  - `u2netp` for speed
  - `modnet` for balance
  - `briaai` for higher quality
- Use `max_resolution` when you need to cap processing size or keep memory use lower.

## When to use

- Product shots
- Portrait cutouts
- Avatar extraction
- Compositing into new scenes

## Good practice

- Pick `modnet` unless the image is very simple or very detail-sensitive.
- Use `briaai` for quality-sensitive cutouts.
- Use `u2netp` when speed matters most.
- Expect a real PNG with transparency, not a text response.
