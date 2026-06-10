# Workflow

The standard pipeline is:

```text
generate -> background_remove/finalize -> inspect -> optimize -> deliver
```

## Common paths

- **Logo / icon:** generate -> `background_remove` with `imgly` or `withoutbg` -> inspect -> `optimize_image`
- **Photoreal subject:** generate -> `background_remove` -> inspect -> `optimize_image`
- **Web-ready banner:** generate -> `finalize_image` -> `optimize_image`

## Inspection

`background_remove` and `finalize_image` emit multi-background inspection sheets to make halos and matte residue easier to spot.

## Optimization

`background_remove` and `finalize_image` already auto-optimize their output. Use `optimize_image` directly when you want explicit control over PNG, WebP, JPEG, or AVIF output.
