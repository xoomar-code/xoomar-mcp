import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Spawns the built server over stdio and talks to it like Claude Desktop would.
async function connect() {
  const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env } });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

test("lists the tools", async () => {
  const c = await connect();
  try {
    const { tools } = await c.listTools();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("short_interest") && names.includes("cot_positioning") && names.includes("api_reference"));
    assert.ok(tools.length >= 20);
  } finally { await c.close(); }
});

test("api_reference answers without network", async () => {
  const c = await connect();
  try {
    const r = await c.callTool({ name: "api_reference", arguments: {} });
    assert.match(r.content[0].text, /terms of use/i);
  } finally { await c.close(); }
});

test("short_interest against the live API", { skip: process.env.XOOMAR_OFFLINE === "1" }, async () => {
  const c = await connect();
  try {
    const r = await c.callTool({ name: "short_interest", arguments: { symbol: "GME", limit: 2 } });
    const j = JSON.parse(r.content[0].text);
    assert.equal(j.source, "xoomar.com");
    assert.ok(Array.isArray(j.data) && j.data.length === 2 && j.data[0].settlementDate);
  } finally { await c.close(); }
});
