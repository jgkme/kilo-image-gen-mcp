# Image Operations Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this MCP into a reliable image operations suite with generation, editing, background removal, and deterministic local transforms, plus companion skills that teach agents how to use those tools well.

**Architecture:** Keep `server.js` as the MCP router, but split behavior into two lanes: provider-backed image generation/editing and local deterministic transforms. Follow the pattern from `agent-media` by making resize/crop/convert/extend/upscale local and predictable, and follow `mcp-image` by normalizing prompts, models, and output metadata for generation/editing. For background removal, use a dedicated pipeline with a clear model/provider choice and consistent PNG output, similar to `rembg-mcp`'s explicit single-image and batch semantics.

**Tech Stack:** Node.js, MCP SDK, `sharp`, `axios`, existing provider APIs, repo-local `.kilo/skills`, and a small smoke-test harness that can run the MCP end to end.

---

## Deep Dive Summary

- `agntswrm/agent-media` cleanly separates local image operations from AI-backed ones. The local set is deterministic and API-free, while edit/remove-background/generate route to providers and always return JSON with an `output_path`.
- `holocode-ai/rembg-mcp` is purpose-built for background removal. It treats background removal as a first-class operation with explicit model selection, alpha matting, and batch support.
- `shinpr/mcp-image` shows the right shape for generation/editing UX: prompt enhancement, quality presets, model routing, aspect-ratio-aware generation, and strong metadata on outputs.

These three patterns are the reference set for this repo's next phase.

---

### Task 1: Normalize the MCP image contract

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Create: `scripts/smoke-image.mjs`

- [ ] **Step 1: Define one output shape for every image tool**

Make every image-producing tool return a predictable object with:

```json
{
  "type": "image",
  "data": "<base64>",
  "mimeType": "image/png",
  "output_path": "/absolute/or/project/path.png"
}
```

Keep multi-image responses as:

```json
{
  "type": "images",
  "images": [ ... ]
}
```

- [ ] **Step 2: Keep all file writes real and on disk**

Every tool that emits an image must write a PNG to disk before returning. Use the repo-aware output directory logic already fixed in `server.js`, and keep `output_path` absolute or project-root-resolved, never a Promise or a virtual URI.

- [ ] **Step 3: Add a smoke script for live MCP calls**

Create `scripts/smoke-image.mjs` that can:

1. Start `server.js` with a chosen provider key.
2. Call `generate_image`, `edit_image`, and `background_remove` directly.
3. Assert that the returned `output_path` exists on disk.

Example invocation:

```bash
node scripts/smoke-image.mjs --provider openrouter --prompt "a parrot on a branch" --output generated-images/parrot.png
```

- [ ] **Step 4: Document the exact output contract**

Update `README.md` so every tool example shows the returned JSON shape and the saved PNG path, matching the behavior already verified in this repo.

---

### Task 2: Make background removal a dedicated image pipeline

**Files:**
- Modify: `server.js`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Separate background removal from the generic image helpers**

Keep `background_remove` as a first-class tool with its own validation and output naming rules. It should not share any generation-specific prompt logic.

- [ ] **Step 2: Add a real segmentation path, not just threshold masking**

Replace the current brightness-threshold mask with a segmentation-backed pipeline. The new flow should:

1. Read the input image once.
2. Produce an alpha matte or transparent cutout.
3. Write a PNG result.
4. Return the exact saved path in the tool result.

Keep a simple local fallback only if the primary segmentation backend is unavailable, but make the primary path quality-oriented, closer to the purpose-built `rembg-mcp` approach.

- [ ] **Step 3: Add model/provider selection**

Support explicit model selection for background removal, with a default that works without extra user input. Mirror the `agent-media`/`rembg-mcp` model naming style so future model swaps are clear in config and docs.

- [ ] **Step 4: Add edge-quality options**

Expose alpha matting or equivalent edge-refinement knobs in the tool schema so users can trade speed for cleaner cutouts, especially for hair, fur, and fine edges.

- [ ] **Step 5: Document local vs provider-backed behavior**

Update the README with a concise matrix that says:

1. Which background-removal path is local.
2. Which path needs an API key.
3. Which path should be used for portraits versus objects.

---

### Task 3: Tighten image editing and generation workflows

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Create: `.kilo/skills/image-generation/SKILL.md`
- Create: `.kilo/skills/image-editing/SKILL.md`

- [ ] **Step 1: Keep generation and editing on separate code paths**

`generate_image` should stay focused on prompt-to-image. `edit_image` should focus on image-to-image and reference-image edits. Do not let either path accrete unrelated post-processing.

- [ ] **Step 2: Add prompt-normalization behavior inspired by `mcp-image`**

Before sending prompts to Gemini or OpenAI, normalize them into a structured prompt with the same intent the user gave, plus only the minimal missing context needed for better output. Preserve user constraints instead of inventing new art direction.

- [ ] **Step 3: Keep model routing explicit**

Maintain the current provider defaults, but make the Gemini image model list explicit and keep the cheapest option as the default. Expose the supported model set in the tool description and README so agents can choose `fast`, `balanced`, or `quality` style flows later.

- [ ] **Step 4: Add editing guidance skills**

Create a skill for image editing prompts that teaches agents to:

1. State the unchanged parts of the source image.
2. State the exact change request.
3. Name the output format and aspect ratio.
4. Prefer single-purpose edits over bundled changes.

Create a separate skill for generation prompts that teaches agents to build a subject/context/style prompt, similar to the `mcp-image` prompt guide.

---

### Task 4: Add deterministic resize/crop/extend/convert/upscale guidance

**Files:**
- Modify: `server.js`
- Modify: `README.md`
- Modify: `.kilo/skills/image-transform/SKILL.md`

- [ ] **Step 1: Keep deterministic transforms local**

Resize, crop, extend, convert, and local upscale should stay API-free where possible and use `sharp` or the local inference stack only when required.

- [ ] **Step 2: Preserve output naming and directory rules**

All local transforms should save into the same repo-aware output directory and follow the same naming conventions as generation/editing.

- [ ] **Step 3: Teach the skill when to use each transform**

Add a skill that explains:

1. Use resize for layout constraints.
2. Use crop for focal framing.
3. Use extend for canvas expansion.
4. Use convert for format changes.
5. Use upscale only when resolution is the bottleneck.

This is the same deterministic/local split that `agent-media` uses successfully.

---

### Task 5: Add integration tests and live-provider smoke tests

**Files:**
- Modify: `scripts/smoke-image.mjs`
- Create: `tests/image-output.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a fast unit test for output-path helpers**

Test the path helper logic directly so the Promise-path regression cannot return. Include a case for default output directories and a case for explicit `output_path` values.

- [ ] **Step 2: Add a live OpenRouter smoke test**

Use the repo's existing OpenRouter setup to verify the MCP can still generate and write a PNG to disk after the refactor.

- [ ] **Step 3: Add provider-skipped tests for Gemini**

Because Gemini quota can be unavailable, make the Gemini test path skippable unless the environment has a usable key and credits. Keep the test harness capable of running a real Gemini call when the account allows it.

- [ ] **Step 4: Add `npm` scripts for repeatability**

Add scripts such as:

```json
{
  "scripts": {
    "smoke": "node scripts/smoke-image.mjs",
    "test": "node --test tests"
  }
}
```

Keep the smoke command explicit about provider and output path so it can be reused by future agent sessions.

---

## Validation Checklist

- `node --check server.js`
- `npm test`
- `node scripts/smoke-image.mjs --provider openrouter --prompt "a parrot on a branch" --output generated-images/parrot.png`
- `node scripts/smoke-image.mjs --provider openai --model gpt-image-1 --prompt "a red panda with glasses" --output generated-images/red-panda.png`
- `node scripts/smoke-image.mjs --provider gemini --model gemini-2.5-flash-image --prompt "a colorful parrot" --output generated-images/gemini-parrot.png` when Gemini quota is available

## Expected Outcome

- Generation, editing, and background removal all return real files on disk.
- Local transforms stay deterministic and fast.
- Prompting guidance is packaged as skills so agents can use the MCP consistently.
- The repo stays easy to validate with smoke tests instead of hand-testing every provider path.
