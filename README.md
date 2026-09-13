# xoomar-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI agents the [XOOMAR](https://xoomar.com/markets) free market data API as tools: 21 tools over 29 datasets built from primary sources (SEC EDGAR and XBRL, FINRA, CFTC, the Federal Reserve, USAspending, exchange APIs). No key needed to start.

## Use it

Claude Desktop (`claude_desktop_config.json`), Claude Code, Cursor, Windsurf and any other MCP client that launches stdio servers:

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

Optional environment: `XOOMAR_API_KEY` (a free account key from https://xoomar.com/signup raises the limit from 30 to 120 requests a minute), `XOOMAR_MAX_ROWS` (rows per tool result, default 200).

## Tools

| Tool | What it returns |
|---|---|
| `short_interest` | FINRA short interest with days to cover, per settlement date |
| `short_volume` | FINRA daily short sale volume and the short share of volume |
| `fails_to_deliver` | SEC fails to deliver by settlement date |
| `insider_trades` | SEC Form 4 insider transactions |
| `planned_insider_sales` | SEC Form 144 notices of proposed sale |
| `large_holders` | Schedule 13D and 13G holders above 5% |
| `fund_holders` | Which tracked 13F managers hold a ticker |
| `fund_portfolio` | One tracked manager's latest 13F portfolio |
| `company_financials` | Quarterly and annual figures and the balance sheet from XBRL |
| `corporate_events` | 8-K material events by item |
| `cot_positioning` | CFTC Commitments of Traders, latest or one market's history |
| `funding_rates` | Perpetual funding on Binance, Bybit and OKX |
| `fed_liquidity` | Net liquidity and its components, or one FRED series |
| `policy_rates` | Central bank policy rates, 49 economies |
| `macro_series` | US yield curve, spreads, stablecoin supply |
| `economic_calendar` | US releases with consensus and actuals |
| `private_placements` | SEC Form D private placements |
| `ipo_pipeline` | S-1, F-1, 424B4, EFFECT and RW filings |
| `bitcoin_treasuries` | Bitcoin held by public companies |
| `federal_contracts` | US federal contract actions by listed parent |
| `crypto_market` | Open interest, liquidations, options metrics, whale positions |
| `api_reference` | How the underlying API works |

Every result carries `updatedAt`, `source` and the attribution line. Ask things like "How has GME short interest moved this year?", "Which tracked funds bought NVDA last quarter?", "What is Fed net liquidity doing?", "Show open-market insider purchases in the last 7 days".

## Data terms

When you republish the data, credit XOOMAR with a visible link to the dataset page on xoomar.com. What you may do with the data is set out at https://xoomar.com/terms.

## Development

```bash
npm install
npm test        # builds, then talks to the server over stdio (one test hits the live API)
```

Apache-2.0 for this code, XOOMAR. The license covers the code only, not the data.
