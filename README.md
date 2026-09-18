# xoomar-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI agents the [XOOMAR](https://xoomar.com/markets) free market data API as tools: 25 tools over 31 datasets built from primary sources (SEC EDGAR and XBRL, FINRA, CFTC, the Federal Reserve, USAspending, exchange APIs). No key needed to start.

## Use it

**Hosted, nothing to install:** `https://xoomar.com/mcp` (Streamable HTTP). Add it as a remote MCP server or custom connector in Claude.ai, Claude Code (`claude mcp add --transport http xoomar https://xoomar.com/mcp`), ChatGPT, Cursor or any client that connects by URL. Send `Authorization: Bearer <key>` or `X-API-Key` with a free account key for 120 requests a minute; without one the limit is 30 a minute per IP.

**Local, over stdio:** Claude Desktop (`claude_desktop_config.json`), Claude Code, Cursor, Windsurf and any other MCP client that launches stdio servers:

```json
{
  "mcpServers": {
    "xoomar": {
      "command": "npx",
      "args": ["-y", "xoomar-mcp"]
    }
  }
}
```

Claude Code, one line:

```bash
claude mcp add xoomar -- npx -y xoomar-mcp
```

As a library (the hosted endpoint is built this way):

```ts
import { buildServer } from "xoomar-mcp";
const server = buildServer({ apiKey: "xm_live_...", maxRows: 100 }); // an McpServer with the 25 tools; connect any transport
```

Optional environment for the stdio bin: `XOOMAR_API_KEY` (a free account key from https://xoomar.com/signup raises the limit from 30 to 120 requests a minute), `XOOMAR_MAX_ROWS` (rows per tool result, default 200).

## Tools

| Tool | What it returns |
|---|---|
| `short_interest` | FINRA short interest with days to cover, per settlement date |
| `short_volume` | FINRA daily short sale volume and the short share of volume, since 2021 |
| `fails_to_deliver` | SEC fails to deliver by settlement date, since 2010 |
| `insider_trades` | SEC Form 4 insider transactions |
| `insider_clusters` | Companies where several insiders bought on the open market in a window |
| `threshold_list` | Reg SHO threshold securities lists (Nasdaq and Cboe, since 2022) |
| `planned_insider_sales` | SEC Form 144 notices of proposed sale |
| `large_holders` | Schedule 13D and 13G holders above 5% |
| `fund_holders` | Which tracked 13F managers hold a ticker |
| `fund_portfolio` | One tracked manager's latest 13F portfolio |
| `company_financials` | Quarterly and annual figures and the balance sheet from XBRL |
| `corporate_events` | 8-K material events by item |
| `cot_positioning` | CFTC Commitments of Traders, latest or one market's history |
| `funding_rates` | Perpetual funding on Binance, Bybit, OKX, Hyperliquid, Kraken and BitMEX |
| `fed_liquidity` | Net liquidity and its components, or one FRED series |
| `policy_rates` | Central bank policy rates, 49 economies |
| `macro_series` | US yield curve, spreads, stablecoin supply |
| `treasury_auctions` | Treasury auction results and calendar since 2010 |
| `economic_calendar` | 22 US release types from the agencies' schedules, with actuals after release |
| `private_placements` | SEC Form D private placements |
| `ipo_pipeline` | S-1, F-1, 424B4, EFFECT and RW filings |
| `bitcoin_treasuries` | Bitcoin held by public companies |
| `federal_contracts` | US federal contract actions by listed parent |
| `crypto_market` | Open interest, liquidations, options metrics, whale positions |
| `api_reference` | How the underlying API works |

Every result carries `updatedAt`, `source` and the attribution line. Ask things like "How has GME short interest moved this year?", "Which tracked funds bought NVDA last quarter?", "What is Fed net liquidity doing?", "Show open-market insider purchases in the last 7 days".

## Where it is listed

Official MCP registry as `com.xoomar/xoomar-mcp` (`server.json` in this repository is what gets published: the npm package and the hosted `https://xoomar.com/mcp` remote), npm as `xoomar-mcp`, and on Glama. The `mcpName` field in `package.json` is the registry's proof that the npm package and the registry entry belong together.

## Data terms

When you republish the data, credit XOOMAR with a visible link to the dataset page on xoomar.com. What you may do with the data is set out at https://xoomar.com/terms.

## Development

```bash
npm install
npm test        # builds, then talks to the server over stdio (one test hits the live API)
```

Apache-2.0 for this code, XOOMAR. The license covers the code only, not the data.
