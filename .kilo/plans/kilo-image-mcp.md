# Plan: Build Kilo Image-Gen MCP (guided by mcp-builder skill + image-gen skill patterns)

## Objective
Restore image generation in Kilo CLI (native experimental feature removed) by building an installable MCP server that calls the Kilo AI Gateway using Kilo Pass credits. Install an MCP-building skill to guide the build, and reuse proven design patterns mined from popular image-gen skills.

## Skills to install (execution phase — not in plan mode)
- **`kilo-org/kilo-marketplace@mcp-builder`** (official, Agent Trust Hub PASS) — drives the build workflow.
  `npx skills add kilo-org/kilo-marketplace@mcp-builder -g -y`
- Rejected for building: `obra/superpowers-lab@mcp-cli` (invokes MCPs, not a builder; audits FAIL) and `shareai-lab/mcp-builder` (Trust Hub FAIL).

## Reusable patterns mined from image-gen skills (incorporated into MCP design)
Source skills use other backends (RunComfy CLI / Google Gemini SDK), but these patterns transfer to our Kilo-Gateway MCP:

### A. Intent → model selection (map onto Kilo's image models)
Embed this guidance in the tool description so the LLM picks well:

| User intent | Kilo model |
|---|---|
| Default / general / unclear | `black-forest-labs/flux.2-pro` |
| Fast iteration / drafts | `black-forest-labs/flux.2-flex` |
| In-image text / posters / multilingual headlines | `openai/gpt-5-image` (`gpt-5-image-mini` for cheap) |
| Highest-fidelity instruction following / real-world grounding | `google/gemini-3-pro-image-preview` |
| Quick grounded iteration | `google/gemini-2.5-flash-image` |

### B. Request schema norms (from runcomfy FLUX schema)
- `prompt`: subject-first declarative, ~512 token soft cap.
- `steps`: 4–8 ideation, ~25 polish (only if the model/endpoint accepts it).
- `width`/`height`: 512–1536, default 1024, aspect ≤ ~16:9.

### C. Aspect handling (from nano-banana)
- Accept `aspect` keyword (`square`/`landscape`/`portrait` → 1:1, 16:9, 9:16). If the chosen model takes `width`/`height`, translate; otherwise prepend an aspect instruction to the prompt.

### D. Reference image / i2i (from both)
- Optional `input_image` (path or base64) enables image-to-image / edit; for chat-completions flow, pass as an `image_url` content part.

### E. Response parsing (from nano-banana + Kilo issue #7001)
- For `/images/generations`: read `data[0].b64_json`.
- For `/chat/completions` (modalities image): iterate message content/parts, find the image part (inline b64 or url), use it. Implement both with a fallback.

### F. Prompt-craft checklist (embed in tool description)
- Subject, style, colors, mood, context, technical (aspect/transparency).

### G. Output handling (from nano-banana workflow)
- Return inline MCP image and optionally save to disk when `output_path` is provided (descriptive filename), mirroring the old native tool that wrote to disk and emitted to UI.

## What the ecosystem comparison showed
Reviewed public repos and issues for image-gen MCPs. The useful takeaways are:
- `thebenlamm/image-gen-mcp` — best feature breadth: multi-provider support, batch generation, capability ops, `image_task`, persistent output, provider transparency.
- `pvliesdonk/image-generation-mcp` — strongest architecture discipline: capability discovery, style metadata, HTTP + stdio, content-addressed assets, background tasks, file-exchange/download handling.
- `simonChoi034/image-gen-mcp` — clean unified provider model: generate/edit/capability introspection with OpenAI/Gemini/Vertex/OpenRouter support.
- `jtxmp/openrouter-image-mcp` — very relevant OpenRouter-specific patterns: `generate_image`, `edit_image`, `batch_images`, `list_image_models`, `check_balance`.
- `Ishan96Dev/mcp-openai-image-generator` — strong packaging and deployment story: NPX-first, HTTP mode, transparent background, variations, rate limiting.

## Issues / complaint patterns observed

### `pvliesdonk/image-generation-mcp`
Open issues show real maintenance pressure around:
- file-exchange migration and download link compatibility
- removing deprecated transport/kwarg plumbing
- keeping gallery download behavior aligned with the newer file-ref model

These are strong indicators that if we adopt file-output + download links, we should keep the contract simple and avoid legacy compat shims unless necessary.

### `thebenlamm/image-gen-mcp`
The documented behavior shows the repo has evolved into a broad platform rather than a narrow image generator:
- batch runs
- asset presets
- capability operations
- provider transparency and planning

That’s great for inspiration, but for our MCP we should avoid overloading v1 with orchestration unless it’s clearly useful.

### `simonChoi034/image-gen-mcp`
The docs explicitly note provider-region limitations for OpenAI/Gemini testing. That’s a reminder to design clean provider fallbacks and fail-soft behavior, since provider access can vary by user region and plan.

## Product decision from the comparison
A single MCP **can and should** support multiple providers via configuration:
- **Kilo Pass** via Kilo Gateway
- **OpenRouter** via API key
- **OpenAI** direct images API
- **Gemini** direct images API

The design pattern is the same across the best repos: provider adapters + env-driven defaults + per-call provider override + capability listing.

## Final MCP tool design — `kilo_generate_image`

### Inputs
- `prompt` (string, required)
- `provider` (string, optional) — `kilo`, `openrouter`, `openai`, `gemini`
- `model` (string, optional, default `black-forest-labs/flux.2-pro`) — provider-specific model
- `size` (string, optional, default `1024x1024`) and/or `width` + `height` (ints; override `size`)
- `aspect` (enum `square|landscape|portrait`, optional) — convenience, maps to size when width/height absent
- `steps` (int, optional) — forwarded only when supported
- `input_image` (string path/b64/url, optional) — enables i2i/edit
- `output_path` (string, optional) — also save PNG to disk

### Behavior
- Route to the selected provider adapter, with `provider` defaulting from env/config.
- Prefer provider-native image endpoints where available.
- For Kilo, POST `https://api.kilo.ai/api/gateway/images/generations` with `Authorization: Bearer $KILO_API_KEY`.
- Fallback to `POST /chat/completions` with `modalities:["image","text"]` for models without an images endpoint.
- Return `{ type:"image", data:<b64>, mimeType:"image/png" }`; if `output_path`, also write file and include its path in a text part.
- Errors return stable structured text JSON: `{ code, message, details?, retryable? }`.

## Additional tools to include
- `list_image_models` — list available models per provider and surface current defaults.
- `get_provider_status` or `get_model_capabilities` — report which providers are configured and what features they support.
- `edit_image` — route existing-image edits / reference-image flows.

## Borrow / avoid decisions

### Borrow
- `thebenlamm`: batch + capability listing + explicit provider routing + asset presets.
- `pvliesdonk`: capability discovery, file output registry, HTTP/stdio transport flexibility.
- `simonChoi034`: unified provider matrix and stable error shapes.
- `jtxmp`: OpenRouter-specific balance/model listing.

### Avoid
- Heavy orchestration in v1 (`image_task`, DAG planners, gallery UI).
- Deep provider-specific surfaces that make the MCP contract unstable.
- Legacy download URL compatibility layers unless the current file-exchange contract truly needs them.

## Build steps (Plain JS, scoped pkg) — applying mcp-builder workflow
1. `npm init -y`; `package.json`: `"type":"module"`, `"@jgkme/kilo-image-gen-mcp"`, `bin`, `engines>=18`, `publishConfig.access=public`, repository, MIT.
2. `npm install @modelcontextprotocol/sdk axios`; `git init -b main`.
3. Implement `server.js` (shebang + stdio) with provider adapters and the tool surface above.
4. `README.md` (install, config matrix, params table, provider guide, troubleshooting), `LICENSE` (MIT, jgkme), `.gitignore`.
5. `.github/workflows/publish.yml` — npm publish on `v*` tag (needs `NPM_TOKEN` secret).

## Kilo config (documented)
```json
"mcp": {
  "kilo-image-gen": {
    "type": "local",
    "command": ["npx", "-y", "@jgkme/kilo-image-gen-mcp"],
    "env": {
      "IMAGE_MCP_DEFAULT_PROVIDER": "kilo",
      "KILO_API_KEY": "your_kilo_api_key_here",
      "OPENROUTER_API_KEY": "your_openrouter_api_key_here",
      "OPENAI_API_KEY": "your_openai_api_key_here",
      "GEMINI_API_KEY": "your_gemini_api_key_here"
    },
    "enabled": true
  }
}