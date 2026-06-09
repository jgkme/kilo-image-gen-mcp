# Enhanced Local Image Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a higher-quality local background-removal backend and a single-call local image workflow so this MCP can handle generation, editing, background removal, cropping, and resize/finalization in a practical all-in-one setup.

**Architecture:** Keep generation/editing provider-backed, but make local manipulation more capable by adding a second background-removal backend optimized for edge quality and a workflow tool that chains local steps without requiring another round trip. Preserve the current `rmbg` path for faster/default processing, and add a quality path for complex subjects and logos. Use the existing `sharp`-based transform helpers as the final stage so output files stay consistent and deterministic.

**Tech Stack:** Node.js, MCP SDK, `sharp`, `rmbg`, `@imgly/background-removal-node`, `axios`, existing provider APIs.

---

## Resource Cost Notes

- CPU-only local background removal is the cheapest path and works well for product shots and simple cutouts.
- Quality-oriented local models are heavier: expect roughly 1-2 GB RAM for inference/runtime overhead, plus 40-170 MB of model downloads depending on the backend/model.
- On first run, the quality path may download model/wasm assets and use more disk, but after that it stays offline.
- GPU is optional; CPU is sufficient for this MCP, but GPU accelerates high-quality models if the host has it.

---

### Task 1: Add a quality-oriented local background-removal backend

**Files:**
- Modify: `server.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] **Step 1: Add the new backend dependency**

Install `@imgly/background-removal-node` and keep `rmbg` as the fast/default backend.

- [ ] **Step 2: Add backend routing to `background_remove`**

Support an input shape like:

```json
{
  "input_image": "./photo.png",
  "backend": "imgly",
  "model": "medium",
  "output_path": "./out.png"
}
```

Backend choices:

```ts
backend: 'rmbg' | 'imgly'
```

For `rmbg`, keep the existing model choices. For `imgly`, support `small` and `medium`.

- [ ] **Step 3: Implement the `imgly` path as the quality mode**

Use `removeBackground(image, { model: 'medium', output: { format: 'image/png', type: 'foreground' }, debug: IMAGE_MCP_DEBUG })` and convert the returned blob to a PNG buffer for disk writes.

- [ ] **Step 4: Preserve the current `rmbg` path as the speed/default mode**

Keep `rmbg` as the default backend so users with simple backgrounds stay on the fastest local path.

- [ ] **Step 5: Document resource usage and backend selection**

Update the README to explain:

1. `rmbg` is the fast default.
2. `imgly` is the higher-quality path.
3. Both run locally and require no API key.
4. The quality path uses more RAM and model storage.

---

### Task 2: Add a single-call local finalization tool

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `scripts/smoke-image.mjs`

- [ ] **Step 1: Add a `finalize_image` tool**

The tool should accept:

```json
{
  "input_image": "./input.png",
  "remove_background": true,
  "background_backend": "imgly",
  "background_model": "medium",
  "crop": true,
  "resize": { "width": 1024, "height": 1024, "fit": "contain" },
  "output_path": "./final.png"
}
```

Behavior:

1. Optionally remove background.
2. Optionally auto-crop/trim.
3. Optionally resize.
4. Save a real PNG to disk.
5. Return the standard resource-link + markdown summary.

- [ ] **Step 2: Keep the workflow deterministic**

Do not call any provider-backed generation tools in this flow. This is a local manipulation helper for assistants that want a one-call finalization step.

- [ ] **Step 3: Add a smoke test path for the workflow**

Extend `scripts/smoke-image.mjs` with a workflow mode that can take a generated image, run finalization, and assert that the final PNG exists.

- [ ] **Step 4: Update the README examples**

Add a small example showing a logo or product image being generated and then finalized locally.

---

### Task 3: Improve edge handling for logo and icon cutouts

**Files:**
- Modify: `server.js`
- Modify: `README.md`

- [ ] **Step 1: Add optional edge refinement flags**

Expose simple knobs such as `feather`, `trim`, and `padding` for the local finalize/background workflow.

- [ ] **Step 2: Add a logo-friendly preset**

Add a preset that favors tighter masking and crop behavior for logos and marks.

- [ ] **Step 3: Make the docs clear about when to use each backend**

Recommend `imgly` for logos, hair, and complex edges, and `rmbg` for fast everyday removal.

---

## Validation Checklist

- `node --check server.js`
- `npm run smoke -- --tool background_remove --backend rmbg --model modnet --input-image generated-images/parrot.png`
- `npm run smoke -- --tool background_remove --backend imgly --model medium --input-image generated-images/j-gemini-openrouter.png`
- `npm run smoke -- --tool finalize_image --input-image generated-images/j-gemini-openrouter.png --remove-background true --background-backend imgly --background-model medium`

## Expected Outcome

- Fast local background removal still works without API keys.
- A higher-quality local backend is available for logos and complex edges.
- A single-call finalization workflow exists for assistants that want one tool to remove backgrounds and tidy the image.
- The README explains the tradeoffs clearly so users know what is CPU/RAM/disk intensive.
