import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, VERSION } from "../dist/server.js";

// The library form: a server built with options talks to the given origin and
// forwards the key and extra headers (what the hosted endpoint at xoomar.com/mcp relies on).
test("buildServer(options) sends the key, extra headers and a versioned user agent", async () => {
  const seen = [];
  const api = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: Array.from({ length: 5 }, (_, i) => ({ i })), updatedAt: "2026-09-18T00:00:00Z", attribution: "credit XOOMAR" }));
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const port = api.address().port;
  try {
    const server = buildServer({ baseUrl: `http://127.0.0.1:${port}/`, apiKey: "xm_live_test", maxRows: 2, headers: { "cf-connecting-ip": "203.0.113.9" }, via: "(hosted)" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientSide);
    const r = await client.callTool({ name: "short_interest", arguments: { symbol: "GME", limit: 2 } });
    const j = JSON.parse(r.content[0].text);
    assert.equal(j.data.length, 2);
    assert.match(j.note, /5 rows/);
    assert.equal(j.attribution, "credit XOOMAR");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "/api/markets/short-interest?symbol=GME");
    assert.equal(seen[0].headers["x-api-key"], "xm_live_test");
    assert.equal(seen[0].headers["cf-connecting-ip"], "203.0.113.9");
    assert.equal(seen[0].headers["user-agent"], `xoomar-mcp/${VERSION} (hosted)`);
    await client.close();
  } finally {
    api.close();
  }
});
