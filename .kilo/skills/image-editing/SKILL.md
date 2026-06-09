---
name: image-editing
description: Write safe edit prompts for this MCP's edit_image tool, preserving identity, composition, and only changing the requested parts.
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
- Use `output_path` for a deterministic saved PNG.
- Use `purpose`, `style`, `aspect`, and `quality` when they help constrain the edit.

## Good practice

- Put invariants first: face, pose, composition, text, background.
- Keep edits to a single intent per call.
- Say what must not change.
- Avoid bundling background changes, subject changes, and style changes into one prompt unless you truly want all three.
