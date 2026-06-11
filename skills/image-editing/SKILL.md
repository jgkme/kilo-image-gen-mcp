---
name: image-editing
description: Use img-gen-mcp edit_image prompts to preserve identity, composition, and only change the requested parts.
---

# Image Editing

Use this skill when the task is to modify an existing image with `edit_image`.

## Prompt shape

State what must stay the same, then state the change:

```text
Keep the subject, framing, and lighting consistent.
Edit the image so the person is facing right.
Preserve the background and clothing unless the change requires otherwise.
```

## Tool guidance

- Use `input_image` for the source image.
- Use `reference_image` when the edit should target a separate reference file.
- Use `input_mode=image-to-image` when you want the backend to treat the image as a guided edit.
- Use `output_path` for a deterministic saved PNG.
- Use `purpose`, `style`, `aspect`, and `quality` when they help constrain the edit.

## Good practice

- Put invariants first: face, pose, composition, text, background.
- Keep edits to a single intent per call.
- Say what must not change.
- Avoid bundling background changes, subject changes, and style changes into one prompt unless you truly want all three.
- For brand refreshes, logo cleanup, or hero art, hand off to `website-asset-workflow` after the edit if the output needs trimming, transparency, or delivery-ready export.
