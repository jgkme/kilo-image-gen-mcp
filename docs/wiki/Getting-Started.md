# Getting Started

This page mirrors `docs/public/quickstart.md`.

- Install: `npm install -g img-gen-mcp`
- Configure your MCP client with `IMAGE_MCP_DEFAULT_PROVIDER` and `IMAGE_MCP_DEFAULT_MODEL`
- For local MLX, set `IMAGE_MCP_LOCAL_PROVIDER=mlx`, `IMAGE_MCP_LOCAL_ENDPOINT`, and `IMAGE_MCP_LOCAL_MODEL`
- Generate an image, then use `background_remove` or `finalize_image` for cleanup
- Use `provider=auto` when you want model-based provider selection
- Use `submit_task` or `batch_generate_image` when you need polling or variant sweeps
- Use `IMAGE_MCP_TRANSPORT=http` with `npm run serve:http` when your client prefers Streamable HTTP
