# Migration from Kilo

The runtime behavior stays the same, but the public product name is now `img-gen-mcp`.

## What changed

- Public package name and CLI branding use `img-gen-mcp`
- Docs and examples should refer to `img-gen-mcp`
- Internal environment variables remain `IMAGE_MCP_*`

## What did not change

- OpenRouter, OpenAI, Gemini, and Kilo Gateway provider support
- `rmbg`, `imgly`, and `withoutbg` backends
- `background_remove`, `finalize_image`, and `optimize_image`
- prompt enhancement and web optimization behavior

## What to update in your config

- Replace the old package name with `img-gen-mcp`
- Keep the same env vars unless you want to change defaults
- Leave `WITHOUTBG_DAEMON_URL` and `WITHOUTBG_AUTOSTART` as-is if you already use the shared daemon
