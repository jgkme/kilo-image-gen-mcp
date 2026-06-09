---
name: image-transform
description: Use this MCP's deterministic local transform tools like resize_image and auto_crop without invoking provider-backed generation.
---

# Image Transform

Use this skill when the task is to reshape an existing image without changing its subject.

## Tool guidance

- Use `resize_image` to change dimensions while preserving the image content.
- Use `auto_crop` to crop to a target size or trim excess whitespace.
- Use `output_path` when you want a stable file path.

## Decision guide

- Use `resize_image` when layout or file size is the constraint.
- Use `auto_crop` when framing or whitespace cleanup is the constraint.

## Good practice

- Keep transforms deterministic.
- Avoid using generation models for simple resizing or cropping.
- Preserve transparency unless the task explicitly asks to flatten it.
