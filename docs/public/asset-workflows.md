# Asset Workflows

`img-gen-mcp` can cover both SVG-oriented asset work and game/sprite-oriented asset pipelines without requiring users to install separate skills.

## SVG and icon assets

Use the main generation and post-processing tools when you need:

- SVG-style logo concepts
- favicon and app icon source art
- crisp single-mark UI symbols
- brand marks that need transparent masters and multiple export sizes

Recommended flow:

1. Start with `generate_image` or `edit_image` for the source concept.
2. Use `analyze_image_result` to inspect the generated output and decide whether the asset should be cleaned up, trimmed, or optimized.
3. Use `finalize_image` or `background_remove` if the asset needs transparency or tighter edges.
4. Use `resize_image` and `optimize_image` to produce the delivery sizes and formats you need.

Good fit signals:

- simple silhouette
- high contrast
- minimal internal texture
- square composition
- transparent master output

## Game sprites and sprite sheets

Use the same MCP server when you need:

- 2D sprite concepts
- transparent frame sheets
- animation-ready sprites
- prop packs or small gameplay assets
- UI/game icons that behave like small sprite-like art

Recommended flow:

1. Generate the source image with `generate_image` or `kilo_generate_image`.
2. Use `batch_generate_image` when you want multiple sprite or prop variants.
3. Use `analyze_image_result` to inspect the image size, alpha, and likely next step.
4. Use `background_remove` for transparent cleanup, then `finalize_image` to trim or normalize the canvas.
5. Use `optimize_image` for export-ready delivery.

Good fit signals:

- transparent PNG output
- simple readable silhouettes
- frame-based or variant-based generation
- game-ready delivery rather than raw concept art

## When to use external skills ideas inside this repo

The repo does not require users to install marketplace skills. Instead, it incorporates the useful ideas directly:

- SVG/logo workflows are captured as web and icon asset guidance.
- Sprite-sheet workflows are captured as game asset guidance.
- Asset analysis is handled by `analyze_image_result` and `suggest_next_step`.

This keeps the public npm/GitHub package self-contained while still preserving the workflow patterns that matter.
