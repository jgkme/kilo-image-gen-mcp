# Overview

`img-gen-mcp` is a local-first MCP server for image generation and final asset preparation.

It was built to cover the full flow from prompt to web-ready file:

1. generate the image
2. remove the background when needed
3. inspect the cutout on multiple backgrounds
4. optimize the final asset for web delivery
5. save the output locally

The server supports OpenRouter, Kilo Gateway, OpenAI, Gemini, and local backends including OpenAI-compatible HTTP servers, MLX-VLM, ComfyUI, Draw Things, and llama.cpp-compatible endpoints. It also exposes a local bootstrap helper so the server can describe the setup steps for the selected local runtime when `IMAGE_MCP_LOCAL_BOOTSTRAP=1` is enabled. ComfyUI is the strongest fit for workflow-driven generation, Draw Things is a straightforward macOS bridge, and llama.cpp-style endpoints are the simplest OpenAI-compatible local path. It is designed for practical production work such as logos, icons, headers, product imagery, subject cutouts, and local-model experiments on a laptop or desktop.
