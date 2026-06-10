# Troubleshooting

## withoutBG daemon is not running

- Start it manually:

```bash
docker compose -f withoutbg-daemon/docker-compose.yml up -d
```

- Or set `WITHOUTBG_AUTOSTART=1` in the MCP environment.

## Wrong default model

- Set `IMAGE_MCP_DEFAULT_MODEL` explicitly in the client environment.

## Provider auth issues

- Verify the correct API key is injected for the selected provider.
- OpenRouter, OpenAI, Gemini, and Kilo Gateway all use separate credentials.

## Need more detail

- Set `IMAGE_MCP_DEBUG=1` and retry the same tool call.
- The server will return provider payloads and fuller errors.
