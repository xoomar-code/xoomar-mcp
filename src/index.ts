#!/usr/bin/env node
/**
 * MCP server for the XOOMAR free market data API (https://xoomar.com/markets/api), over stdio.
 *
 * No key is needed (10 requests a minute per IP); set XOOMAR_API_KEY for 30 a minute
 * with a free account key from https://xoomar.com/signup. XOOMAR_MAX_ROWS caps rows per
 * result (default 200). The same server is hosted at https://xoomar.com/mcp.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

async function main() {
  const server = buildServer({
    baseUrl: process.env.XOOMAR_BASE_URL,
    apiKey: process.env.XOOMAR_API_KEY,
    maxRows: process.env.XOOMAR_MAX_ROWS ? Number(process.env.XOOMAR_MAX_ROWS) : undefined,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// The package is a bin: the module is always the entry point (npx resolves it through a
// .bin symlink, so comparing paths with import.meta.url is unreliable).
main().catch((e) => { console.error(e); process.exit(1); });
