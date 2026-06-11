---
name: image-transform
description: Use img-gen-mcp deterministic local transform tools like resize_image, auto_crop, optimize_image, and finalize_image.
---

# Image Transform

Use this skill when the task is to reshape an existing image without changing its subject.

## Tool guidance

- Use `resize_image` to change dimensions while preserving the image content.
- Use `auto_crop` to crop to a target size or trim excess whitespace.
- Use `optimize_image` to export web-ready PNG, WebP, JPEG, or AVIF output.
- Use `finalize_image` when you want crop, trim, resize, and optional background removal in one step.
- Use `output_path` when you want a stable file path.
- Use `website-asset-workflow` for logo, favicon, and site-asset delivery guidance when the resize is part of a broader web pipeline.
- Use `sprite-workflow` for sprite sheets, transparent frame exports, and game-ready asset guidance when the resize is part of a broader game-art pipeline.

## Decision guide

- Use `resize_image` when layout or file size is the constraint.
- Use `auto_crop` when framing or whitespace cleanup is the constraint.
- Use `optimize_image` when the file needs delivery-ready compression.
- Use `finalize_image` when you want a one-call cleanup and export pipeline.

## Good practice

- Keep transforms deterministic.
- Avoid using generation models for simple resizing or cropping.
- Preserve transparency unless the task explicitly asks to flatten it.
