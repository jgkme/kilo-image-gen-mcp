# Overview

`img-gen-mcp` is a local-first MCP server for image generation and final asset preparation.

It was built to cover the full flow from prompt to web-ready file:

1. generate the image
2. remove the background when needed
3. inspect the cutout on multiple backgrounds
4. optimize the final asset for web delivery
5. save the output locally

The server supports OpenRouter, Kilo Gateway, OpenAI, Gemini, and local background-removal backends. It is designed for practical production work such as logos, icons, headers, product imagery, and subject cutouts.
