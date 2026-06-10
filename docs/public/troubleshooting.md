# Troubleshooting

## withoutBG daemon is not running

- Start it manually:

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```

- Or set `WITHOUTBG_AUTOSTART=1` in the MCP environment.

## Local provider is not reachable

- Verify `IMAGE_MCP_LOCAL_ENDPOINT` is correct.
- Make sure the local model server is already running.
- If you enabled bootstrap, check that the selected runtime actually has a local launch command.

## Can it use app-bundled models?

- Not directly inside Cursor, Claude Code, or Codex.
- Use a local endpoint or bridge instead.
- If the app exposes HTTP, point `IMAGE_MCP_LOCAL_ENDPOINT` at that surface.

## Wrong local model

- Set `IMAGE_MCP_LOCAL_MODEL` explicitly.
- Make sure the model slug matches the runtime wrapper.

## Provider auth issues

- Verify the correct API key is injected for the selected provider.
- OpenRouter, OpenAI, Gemini, and Kilo Gateway all use separate credentials.

## Need more detail

- Set `IMAGE_MCP_DEBUG=1` and retry the same tool call.
- The server will return provider payloads and fuller errors.
