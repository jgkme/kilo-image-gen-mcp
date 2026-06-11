#!/usr/bin/env node
import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServerContext } from '../server.js';

const PORT = Number(process.env.IMAGE_MCP_HTTP_PORT || 3333);
const HOST = process.env.IMAGE_MCP_HTTP_HOST || '127.0.0.1';

const context = createServerContext();
const server = new Server(
  { name: context.name, version: context.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await context.listTools() }));
server.setRequestHandler(CallToolRequestSchema, async (request) => context.callTool(request));

const transport = new StreamableHTTPServerTransport();

await server.connect(transport);

const httpServer = http.createServer(async (req, res) => {
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(error?.message || error) }));
  }
});

httpServer.listen(PORT, HOST, () => {
  process.stderr.write(`img-gen-mcp http listening on http://${HOST}:${PORT}\n`);
});
