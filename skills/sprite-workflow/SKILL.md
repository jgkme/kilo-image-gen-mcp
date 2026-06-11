---
name: sprite-workflow
description: Use img-gen-mcp to generate and refine 2D sprite sheets, transparent frames, map props, and game UI assets.
---

# Sprite Workflow

Use this skill when the task is to create game-ready sprites, sprite sheets, transparent frame exports, or small HUD-style assets with `img-gen-mcp`.

## Typical workflow

1. Generate the base concept with `generate_image` or `kilo_generate_image`.
2. Use `batch_generate_image` when you want multiple animation or variant candidates.
3. Use `analyze_image_result` to inspect whether the asset should be trimmed, simplified, or made transparent.
4. Use `background_remove` to isolate the sprite or prop.
5. Use `finalize_image` to trim, resize, and normalize the output canvas.
6. Use `optimize_image` only when you need a delivery-ready export format.

## Best fits

- 2D character sprites
- enemy / monster sheets
- spell or effect frames
- transparent props
- game UI icons that need a sprite-like delivery pipeline
- small environment pieces and item icons

## Prompt guidance

- Keep the prompt focused on one sprite family or one animation set.
- State the art style, silhouette needs, and whether transparency is required.
- Mention frame count or variation count when you know it.
- Keep the subject readable at small sizes.
- Prefer simple shapes and high contrast for game UI and sprites.

## Asset handling

- Use square masters for icon-like sprites.
- Preserve transparency unless the game pipeline explicitly wants a flat background.
- Save masters and exports to deterministic paths so the game build can reference them.
- If you need multiple candidates, keep the best sprite variant and discard the rest after review.

## Handoff rule

- Use this skill as the default guide for sprite sheets, sprite frames, prop packs, and similar game assets.
- Use `website-asset-workflow` when the asset is not a sprite but still needs website delivery.
