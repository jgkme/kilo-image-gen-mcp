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
- Run `node ./scripts/bootstrap-local-runtime.mjs` to print the expected startup command and endpoint values.

## Can it use app-bundled models?

- Not directly inside Cursor, Claude Code, or Codex.
- Use a local endpoint or bridge instead.
- If the app exposes HTTP, point `IMAGE_MCP_LOCAL_ENDPOINT` at that surface.

## Wrong local model

- Set `IMAGE_MCP_LOCAL_MODEL` explicitly.
- Make sure the model slug matches the runtime wrapper.

## Bootstrap helper prints the wrong instructions

- Verify `IMAGE_MCP_LOCAL_PROVIDER` matches the runtime you actually want.
- Run `node ./scripts/bootstrap-local-runtime.mjs` with the same environment block you pass to the MCP client.
- If you are using a local endpoint that is already running, disable bootstrap mode and point `IMAGE_MCP_LOCAL_ENDPOINT` directly at it.

## Auto-selected provider looks wrong

- Pass an explicit `provider` if you want to override inference.
- If `provider=auto` is used, the model slug wins before the default provider.

## HTTP transport does not start

- Make sure `IMAGE_MCP_TRANSPORT=http` is set.
- Start the server with `npm run serve:http` instead of `npm start`.
- Verify the client supports Streamable HTTP MCP transport.

## Provider auth issues

- Verify the correct API key is injected for the selected provider.
- OpenRouter, OpenAI, Gemini, and Kilo Gateway all use separate credentials.

## Need more detail

- Set `IMAGE_MCP_DEBUG=1` and retry the same tool call.
- The server will return provider payloads and fuller errors.
