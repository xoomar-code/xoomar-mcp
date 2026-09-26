/**
 * The XOOMAR MCP server as a library: `buildServer()` returns an McpServer with the
 * 26 tools, each calling the public JSON API (https://xoomar.com/markets/api) and
 * returning the `data` part plus the source and attribution line from the envelope.
 *
 * The npm bin (`xoomar-mcp`) runs it over stdio; the hosted endpoint at
 * https://xoomar.com/mcp runs the same server over Streamable HTTP.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const VERSION = "0.1.10";

export interface ServerOptions {
  /** API origin; the hosted endpoint points this at its own loopback address. */
  baseUrl?: string;
  /** Free account key (X-API-Key): 30 requests a minute instead of 10. */
  apiKey?: string;
  /** Rows per tool result before the list is cut with a note (default 200). */
  maxRows?: number;
  /** Extra request headers, e.g. the caller's IP forwarded by the hosted endpoint. */
  headers?: Record<string, string>;
  /** Shown in the User-Agent after xoomar-mcp/<version>. */
  via?: string;
}

type Params = Record<string, string | number | boolean | undefined>;

export type ApiCall = (path: string, params?: Params) => Promise<{ data: unknown; meta: Record<string, unknown> }>;

export function makeApiCall(options: ServerOptions): ApiCall {
  const baseUrl = (options.baseUrl || "https://xoomar.com").replace(/\/$/, "");
  return async (path, params = {}) => {
  const u = new URL(`${baseUrl}/api/markets/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== false) u.searchParams.set(k, v === true ? "1" : String(v));
  const headers: Record<string, string> = { ...(options.headers ?? {}), Accept: "application/json", "User-Agent": `xoomar-mcp/${VERSION}${options.via ? ` ${options.via}` : ""}` };
  if (options.apiKey) headers["x-api-key"] = options.apiKey;
  const res = await fetch(u, { headers, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) throw new Error(`XOOMAR rate limit reached (${res.headers.get("retry-after") ?? "?"}s). 10 requests a minute without a key, 30 with a free key: set XOOMAR_API_KEY.`);
  if (!res.ok) throw new Error(`XOOMAR API ${res.status} for ${u.pathname}${u.search}: ${(await res.text()).slice(0, 200)}`);
  const payload = (await res.json()) as Record<string, unknown>;
  const { data, ...meta } = payload;
  return { data, meta };
  };
}

/** Trim long arrays so a tool result stays readable, and say so. */
function shape(data: unknown, limit: number): { data: unknown; note?: string } {
  if (Array.isArray(data) && data.length > limit) return { data: data.slice(0, limit), note: `${data.length} rows, showing the first ${limit}. Narrow the query or fetch the CSV from the API for the full set.` };
  return { data };
}

function makeText(maxRows: number) {
  return function text(result: { data: unknown; meta: Record<string, unknown> }, opts: { limit?: number; newestFirst?: boolean } = {}) {
    const { data, note } = shape(result.data, opts.limit ?? maxRows);
    const out = {
      data,
      ...(note ? { note } : {}),
      updatedAt: result.meta.updatedAt,
      source: "xoomar.com",
      attribution: result.meta.attribution ?? "Credit XOOMAR with a link to the dataset page on xoomar.com when you republish this data",
      docs: result.meta.docs ?? "https://xoomar.com/markets/api",
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(out) }] };
  };
}

const symbolArg = z.string().min(1).max(12).describe("US ticker symbol, e.g. GME. Class shares as on the SEC list, e.g. BRK-B.");

export function buildServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "xoomar", version: VERSION });
  const callApi = makeApiCall(options);
  const text = makeText(options.maxRows ?? 200);

  server.registerTool("short_interest", {
    title: "FINRA short interest",
    description: "Short interest for a US stock: shares short, average daily volume, days to cover, change, per FINRA settlement date (twice a month), newest first. Without a symbol: the latest settlement's highest days-to-cover names.",
    inputSchema: { symbol: symbolArg.optional(), limit: z.number().int().min(1).max(500).optional().describe("Rows to return (default 24)") },
  }, async ({ symbol, limit }) => text(await callApi("short-interest", { symbol }), { limit: limit ?? 24 }));

  server.registerTool("short_volume", {
    title: "FINRA daily short sale volume",
    description: "Daily short sale volume and total volume per symbol from FINRA's Reg SHO files since August 2021, with the short share of volume. History for a symbol (oldest first; from, to and limit select the window, up to 5,000 days) or the latest day's largest short volumes.",
    inputSchema: { symbol: symbolArg.optional(), days: z.number().int().min(1).max(5000).optional().describe("Newest days of history for a symbol (default 60)"), from: z.string().max(10).optional().describe("YYYY-MM-DD"), to: z.string().max(10).optional().describe("YYYY-MM-DD") },
  }, async ({ symbol, days, from, to }) => text(await callApi("short-volume", { symbol, days, from, to })));

  server.registerTool("fails_to_deliver", {
    title: "SEC fails to deliver",
    description: "SEC fails-to-deliver quantity and price by settlement date for a symbol since January 2010 (from, to and limit select the window, up to 5,000 dates), or the latest settlement's largest fails by value.",
    inputSchema: { symbol: symbolArg.optional(), from: z.string().max(10).optional().describe("YYYY-MM-DD"), to: z.string().max(10).optional().describe("YYYY-MM-DD"), limit: z.number().int().min(1).max(5000).optional().describe("Newest dates in the window (default 400)") },
  }, async ({ symbol, from, to, limit }) => text(await callApi("fails-to-deliver", { symbol, from, to, limit }), { limit: 120 }));

  server.registerTool("insider_trades", {
    title: "SEC Form 4 insider trades",
    description: "Insider transactions from SEC Form 4: insider name and title, transaction code, shares, price, value, date. History for a ticker (from, to and limit select the window, up to 2,000 rows) or the latest trades across companies (type buys for open-market purchases, sells for sales).",
    inputSchema: { ticker: symbolArg.optional(), type: z.enum(["buys", "sells"]).optional().describe("buys: open-market purchases, sells: sales (latest view only)"), window: z.enum(["7d", "30d", "90d"]).optional(), from: z.string().max(10).optional().describe("YYYY-MM-DD (ticker history only)"), to: z.string().max(10).optional().describe("YYYY-MM-DD (ticker history only)"), limit: z.number().int().min(1).max(2000).optional().describe("Newest rows in the window (ticker history only, default 200)") },
  }, async ({ ticker, type, window, from, to, limit }) => text(ticker ? await callApi(`insiders/${ticker.toLowerCase()}`, { from, to, limit }) : await callApi("insiders", { type, window }), { limit: 100 }));

  server.registerTool("insider_clusters", {
    title: "Insider cluster buying",
    description: "Companies where several different insiders bought their own stock on the open market within a window (Form 4 transaction code P only): distinct buyers with titles, trades, combined value, first and latest trade dates. Default: three or more insiders in 30 days, sorted by number of insiders then value. Use ticker to check one company.",
    inputSchema: { days: z.number().int().min(1).max(365).optional().describe("Window in days (default 30)"), minInsiders: z.number().int().min(2).max(20).optional().describe("Distinct buyers required (default 3)"), minUsd: z.number().min(0).optional().describe("Combined purchases at or above this, USD"), ticker: symbolArg.optional(), limit: z.number().int().min(1).max(500).optional() },
  }, async ({ days, minInsiders, minUsd, ticker, limit }) => text(await callApi("insiders/clusters", { days, minInsiders, minUsd, ticker, limit }), { limit: limit ?? 50 }));

  server.registerTool("threshold_list", {
    title: "Regulation SHO threshold securities",
    description: "Reg SHO threshold lists from the Nasdaq and Cboe daily files since 2022: securities whose fails to deliver stayed above the threshold for five settlement days. One date (default the newest), one symbol's days on the list, or one listing market.",
    inputSchema: { date: z.string().max(10).optional().describe("YYYY-MM-DD"), symbol: symbolArg.optional(), market: z.enum(["nasdaq", "cboe"]).optional(), limit: z.number().int().min(1).max(5000).optional() },
  }, async ({ date, symbol, market, limit }) => text(await callApi("threshold-list", { date, symbol, market, limit }), { limit: limit ?? 200 }));

  server.registerTool("planned_insider_sales", {
    title: "SEC Form 144 notices of proposed sale",
    description: "Form 144 notices: an affiliate's planned sale of restricted or control stock (seller, shares, approximate market value, planned date), filed before the trade.",
    inputSchema: { symbol: symbolArg.optional(), days: z.number().int().min(1).max(365).optional() },
  }, async ({ symbol, days }) => text(await callApi("planned-sales", { symbol, days }), { limit: 100 }));

  server.registerTool("large_holders", {
    title: "Schedule 13D and 13G holders",
    description: "Holders above 5% from Schedule 13D (active) and 13G (passive) cover pages: holder, shares, percent of class, filing date. For a symbol or the latest filings.",
    inputSchema: { symbol: symbolArg.optional(), form: z.enum(["13D", "13G"]).optional(), days: z.number().int().min(1).max(365).optional(), sort: z.enum(["filed", "percent"]).optional() },
  }, async ({ symbol, form, days, sort }) => text(await callApi("large-holders", { symbol, form, days, sort }), { limit: 100 }));

  server.registerTool("fund_holders", {
    title: "13F institutional holders of a stock",
    description: "Which tracked 13F managers (Berkshire, Bridgewater, Citadel, Renaissance and others) held a ticker at their latest quarterly filing: shares, value, share of portfolio, change.",
    inputSchema: { ticker: symbolArg },
  }, async ({ ticker }) => text(await callApi("funds", { ticker })));

  server.registerTool("fund_portfolio", {
    title: "A tracked manager's 13F portfolio",
    description: "The latest 13F portfolio of one tracked manager by slug, e.g. berkshire-hathaway, bridgewater, citadel-advisors, renaissance-technologies. Positions with value, shares and share of portfolio.",
    inputSchema: { slug: z.string().min(2).max(60).describe("Manager slug, e.g. berkshire-hathaway") },
  }, async ({ slug }) => text(await callApi(`funds/${slug}`)));

  server.registerTool("company_financials", {
    title: "Company financials from SEC XBRL",
    description: "Quarterly revenue, net income and diluted EPS (calendar quarters, fourth quarter derived from the annual report), annual revenue, net income, operating cash flow, capex, buybacks and dividends, and the latest balance sheet instants, from the company's own XBRL filings.",
    inputSchema: { symbol: symbolArg },
  }, async ({ symbol }) => text(await callApi("financials", { symbol })));

  server.registerTool("corporate_events", {
    title: "SEC 8-K material events",
    description: "8-K current reports with their item numbers (2.02 earnings, 5.02 officer changes, 1.01 agreements and so on), for a ticker or the latest across companies.",
    inputSchema: { ticker: symbolArg.optional(), item: z.string().max(8).optional().describe("8-K item number, e.g. 2.02"), days: z.number().int().min(1).max(90).optional().describe("Window in days (default 30, max 90)") },
  }, async ({ ticker, item, days }) => text(await callApi("events", { ticker, item, days }), { limit: 100 }));

  server.registerTool("earnings_calendar", {
    title: "Earnings calendar (8-K Item 2.02)",
    description: "When US companies report results, from their own 8-K filings. With a ticker: every reported date since 2023 and the next expected date (an estimate until the company confirms it). Without: the calendar window (default today to 14 days ahead; from and to open any window up to 120 days; status reported or estimated). Dates only, no EPS or consensus.",
    inputSchema: { ticker: symbolArg.optional(), from: z.string().max(10).optional().describe("YYYY-MM-DD"), to: z.string().max(10).optional().describe("YYYY-MM-DD"), status: z.enum(["reported", "estimated"]).optional(), limit: z.number().int().min(1).max(2000).optional() },
  }, async ({ ticker, from, to, status, limit }) => text(ticker && !from && !to && !status ? await callApi(`earnings/${ticker.toLowerCase()}`) : await callApi("earnings", { ticker, from, to, status, limit }), { limit: limit ?? 200 }));

  server.registerTool("cot_positioning", {
    title: "CFTC Commitments of Traders",
    description: "Weekly CFTC positioning: the latest report across all tracked markets, or one market's history by slug (e.g. gold, bitcoin, euro-fx, e-mini-s-p-500-stock-index, 10-year-u-s-treasury-notes-chicago-board-of-trade; the latest report lists every slug): open interest and long/short by trader category.",
    inputSchema: { market: z.string().max(40).optional().describe("Market slug, e.g. gold; omit for the latest report across markets"), limit: z.number().int().min(1).max(500).optional() },
  }, async ({ market, limit }) => text(market ? await callApi(`cot/${market}`) : await callApi("cot"), { limit: limit ?? 52 }));

  server.registerTool("funding_rates", {
    title: "Perpetual futures funding rates",
    description: "Current perpetual funding rates on Binance, Bybit, OKX, Hyperliquid and Kraken for tracked crypto symbols (hourly venues shown as the 8-hour equivalent), or one symbol's history by slug (e.g. btc, eth, sol).",
    inputSchema: { slug: z.string().max(20).optional() },
  }, async ({ slug }) => text(slug ? await callApi(`funding-rates/${slug}`) : await callApi("funding-rates"), { limit: 200 }));

  server.registerTool("fed_liquidity", {
    title: "Fed liquidity",
    description: "Weekly US net liquidity (Fed balance sheet minus the Treasury General Account minus reverse repo) with its components, oldest first, or one FRED series (WALCL, WRESBAL, RRPONTSYD, WTREGEN, SOFR, EFFR, IORB, WSHOSHO).",
    inputSchema: { series: z.string().max(12).optional(), limit: z.number().int().min(1).max(2000).optional().describe("Most recent N observations (default 52)") },
  }, async ({ series, limit }) => text(await callApi("fed-liquidity", { series, limit: limit ?? 52 }), { limit: limit ?? 52 }));

  server.registerTool("policy_rates", {
    title: "Central bank policy rates",
    description: "Central bank policy rates for 38 economies with a current series: the current table, or one country code's history (e.g. us, xm for the euro area, jp, gb).",
    inputSchema: { country: z.string().max(4).optional() },
  }, async ({ country }) => text(country ? await callApi(`rates/${country.toLowerCase()}`) : await callApi("rates"), { limit: 120 }));

  server.registerTool("macro_series", {
    title: "US macro series",
    description: "US Treasury yield curve points, curve spreads and stablecoin supply as daily series. Filter by series name and date range.",
    inputSchema: { series: z.string().max(40).optional(), from: z.string().max(10).optional().describe("YYYY-MM-DD"), to: z.string().max(10).optional() },
  }, async ({ series, from, to }) => text(await callApi("macro", { series, from, to }), { limit: 200 }));

  server.registerTool("treasury_auctions", {
    title: "US Treasury auctions",
    description: "Treasury auction results and calendar since 2010 from TreasuryDirect: security type and term, auction and issue dates, offering amount, high yield or discount rate, bid-to-cover, dealer, direct and indirect allotments. Default: coupon auctions (notes, bonds, TIPS, FRNs); upcoming=true lists announced auctions not yet run.",
    inputSchema: { type: z.enum(["Note", "Bond", "TIPS", "FRN", "Bill", "CMB", "all"]).optional(), term: z.string().max(30).optional().describe("One term, e.g. 10-Year"), from: z.string().max(10).optional().describe("YYYY-MM-DD"), to: z.string().max(10).optional().describe("YYYY-MM-DD"), upcoming: z.boolean().optional(), limit: z.number().int().min(1).max(5000).optional() },
  }, async ({ type, term, from, to, upcoming, limit }) => text(await callApi("treasury-auctions", { type, term, from, to, upcoming: upcoming ? 1 : undefined, limit }), { limit: limit ?? 100 }));

  server.registerTool("economic_calendar", {
    title: "US economic calendar",
    description: "Scheduled US releases from the agencies' own calendars (CPI, PPI, payrolls, weekly jobless claims, PCE, GDP, retail sales, housing, durable goods, industrial production, trade, FOMC decisions and minutes, Beige Book), with the actual and previous print filled after release and a unit field. No consensus figures. Default window: last 7 days to next 30.",
    inputSchema: { from: z.string().max(10).optional().describe("YYYY-MM-DD"), to: z.string().max(10).optional().describe("YYYY-MM-DD"), importance: z.enum(["high", "medium", "low"]).optional() },
  }, async ({ from, to, importance }) => text(await callApi("calendar", { from, to, importance: importance === "medium" ? "med" : importance })));

  server.registerTool("private_placements", {
    title: "SEC Form D private placements",
    description: "Form D notices of exempt offerings: issuer, amount sold, amount offered, investors, whether it is a pooled fund. Largest raises in a window, one issuer by CIK, or the most recent filings.",
    inputSchema: { days: z.number().int().min(1).max(365).optional(), cik: z.string().max(10).optional(), sort: z.enum(["recent"]).optional(), funds: z.boolean().optional().describe("Include pooled investment funds") },
  }, async ({ days, cik, sort, funds }) => text(await callApi("startup-funding", { days, cik, sort, funds }), { limit: 100 }));

  server.registerTool("ipo_pipeline", {
    title: "IPO pipeline",
    description: "S-1 and F-1 registration statements, 424B4 final prospectuses, EFFECT notices and RW withdrawals from EDGAR, with the filer's listing status.",
    inputSchema: { form: z.string().max(20).optional().describe("e.g. S-1,F-1 or 424B4"), days: z.number().int().min(1).max(365).optional(), new: z.boolean().optional().describe("Only filers not yet on the ticker list") },
  }, async ({ form, days, new: onlyNew }) => text(await callApi("ipos", { form, days, new: onlyNew }), { limit: 100 }));

  server.registerTool("bitcoin_treasuries", {
    title: "Bitcoin held by public companies",
    description: "Bitcoin holdings of public companies from their own XBRL filings: coins, fair value, cost basis, as of the filing period.",
    inputSchema: {},
  }, async () => text(await callApi("bitcoin-treasuries")));

  server.registerTool("federal_contracts", {
    title: "US federal contract actions",
    description: "Largest US federal contract actions from USAspending, optionally summed by listed parent company (by=ticker) or filtered to one ticker.",
    inputSchema: { ticker: symbolArg.optional(), days: z.number().int().min(1).max(365).optional(), by: z.enum(["ticker"]).optional(), listed: z.boolean().optional() },
  }, async ({ ticker, days, by, listed }) => text(await callApi("federal-contracts", { ticker, days, by, listed }), { limit: 100 }));

  server.registerTool("crypto_market", {
    title: "Crypto market data",
    description: "Open interest history for a symbol slug, recent liquidations across exchanges, Deribit options metrics (put/call, max pain, DVOL) for BTC or ETH, or Hyperliquid whale positions.",
    inputSchema: { dataset: z.enum(["open-interest", "liquidations", "options", "whales"]), slug: z.string().max(20).optional().describe("open-interest: symbol slug (e.g. btc); options: BTC or ETH; whales: coin (optional)") },
  }, async ({ dataset, slug }) => {
    const path = dataset === "open-interest" ? `open-interest/${slug || "btc"}` : dataset === "options" ? `options/${(slug || "BTC").toUpperCase()}` : dataset === "whales" ? (slug ? `whales/${slug}` : "whales") : "liquidations";
    return text(await callApi(path), { limit: 200 });
  });

  server.registerTool("api_reference", {
    title: "XOOMAR API reference",
    description: "How the underlying free API works: endpoints, parameters, rate limits, CSV downloads and the attribution terms. Use when a tool here does not cover the exact query.",
    inputSchema: {},
  }, async () => ({ content: [{ type: "text" as const, text: [
    "XOOMAR free market data API. Base URL https://xoomar.com/api/markets/<dataset>. JSON envelope {data, updatedAt, source, docs, license, attribution}; CSV at /api/markets/<dataset>/csv.",
    "Limits: 10 requests a minute per IP without a key, 30 with a free account key (X-API-Key header, https://xoomar.com/signup); keyless and free-key requests return up to six months of history; 429 carries Retry-After.",
    "Datasets: short-interest, short-volume, fails-to-deliver, insiders, planned-sales, large-holders, funds, financials, buybacks, events, structured-products, federal-contracts, startup-funding, ipos, bitcoin-treasuries, cot, funding-rates, open-interest, liquidations, options, whales, sentiment, signals, etf-flows, earnings, macro, fed-liquidity, rates, calendar, threshold-list, treasury-auctions, insiders/clusters.",
    "Full reference with every parameter and field: https://xoomar.com/markets/api. Filing types explained: https://xoomar.com/markets/sec-filings.",
    "Attribution: when the data is republished (site, app, article, chart, dataset), credit XOOMAR with a visible link to the dataset page on xoomar.com. Terms of use: https://xoomar.com/terms.",
  ].join("\n") }] }));

  return server;
}
