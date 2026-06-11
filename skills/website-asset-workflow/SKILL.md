---
name: website-asset-workflow
description: Create and refine website assets like logos, favicons, social images, and hero art with img-gen-mcp generation, background removal, cropping, resizing, and optimization.
---

# Website Asset Workflow

Use this skill when the task is to create or prepare website-ready assets such as logos, favicons, app icons, OG images, hero art, header artwork, or transparent cutouts.

## Typical workflow

1. Generate or edit the source image with `generate_image`, `kilo_generate_image`, or `edit_image`.
2. Remove the background with `background_remove` when you need transparency.
3. Crop or trim with `auto_crop` or `finalize_image`.
4. Resize to the target delivery size with `resize_image` or `finalize_image`.
5. Optimize the final asset with `optimize_image`.

## MCP-aware guidance

- Use `list_image_models` before a workflow if you need to verify local or cloud provider availability.
- Use `get_provider_status` when you want to confirm local bootstrap, endpoint, or default-provider settings.
- Use `provider=auto` for generation when the model slug already implies the backend family.
- Use `submit_task` if the image job is long-running and the client wants polling.
- Use `batch_generate_image` for logo variants, favicon concepts, or social image sweeps.

## Common outputs

- Logo masters in transparent PNG
- Favicons and app icons at square sizes
- Social previews for Open Graph and X cards
- Website hero illustrations and header images
- Product cutouts on transparent or solid backgrounds

## Suggested target sizes

- Logo mark: `1024x1024` master, then derive smaller sizes
- Favicon source: square image with strong silhouette, then export common favicon sizes outside the MCP if needed
- Open Graph image: `1200x630`
- Social square: `1080x1080`
- Hero/banner: `1600x900` or `1920x1080`

## Tool guidance

- Use `input_mode=image-to-image` for guided logo refreshes or brand variations.
- Use `reference_image` when the source should stay visually close to an existing asset.
- Use `background_remove` with `imgly` for quick logo cleanup and `withoutbg` for harder edges.
- Use `finalize_image` when you need trim, crop, resize, and optional background removal in one pass.
- Use `optimize_image` for delivery-ready PNG, WebP, JPEG, or AVIF output.
- Use `output_path` to place the file exactly where the website build expects it.

## Placement guidance

- Put source masters in a dedicated asset folder such as `assets/`, `public/`, or the project's existing image directory.
- Keep transparent masters separate from web-optimized exports.
- Use deterministic filenames for logos and favicons so they can be referenced from the app build or static site pipeline.
- Preserve a full-size master before creating smaller derivatives.

## Handoff rule

- Use this skill as the default guide whenever the result will ship on a website or product surface.
- If you only need a single image without delivery steps, use `image-generation` instead.

## Good practice

- Keep logos simple, high-contrast, and silhouette-friendly.
- Use square composition for favicons and app icons.
- Avoid tiny details that disappear at 16x16 or 32x32.
- Prefer transparency for logo masters unless the brand requires a solid background.
- Optimize the final export for the target medium instead of shipping the raw generation result.
