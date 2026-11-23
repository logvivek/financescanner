"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { XMLParser } = require("fast-xml-parser");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const RSS_QUERY = "NSE BSE NIFTY India stock market when:1d";
const NSE_FO_SYMBOLS_URL = "https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv";
const YAHOO_SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark";
const CACHE_DURATION_MS = 2 * 60 * 1000;
const MAX_FEED_LENGTH = 1024 * 1024;
const MAX_SYMBOLS_FILE_LENGTH = 256 * 1024;
const MAX_ARTICLES = 5;
const YAHOO_BATCH_SIZE = 20;
const YAHOO_CONCURRENCY = 3;
const RSI_PERIOD = 14;
const MAX_MARKET_DATA_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_RANGES = new Set(["38-43", "58-62"]);

const assets = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }]
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true
});

let cachedResearch = null;
let cachedUntil = 0;
let pendingResearchRequest = null;

function getXmlText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value["#text"] === "string") {
    return value["#text"].trim();
  }
  return "";
}

function removePublisherSuffix(title, source) {
  for (const separator of [" - ", " – ", " — "]) {
    const suffix = `${separator}${source}`;
    if (title.endsWith(suffix)) return title.slice(0, -suffix.length).trim();
  }
  return title;
}

function parseGoogleNewsFeed(xml, now = Date.now()) {
  const parsed = xmlParser.parse(xml);
  const channel = parsed && parsed.rss && parsed.rss.channel;
  if (!channel || typeof channel !== "object") {
    throw new Error("Google News returned an invalid RSS feed.");
  }
  const rawItems = channel.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const articles = [];
  const seenTitles = new Set();

  items.forEach(item => {
    const source = getXmlText(item.source);
    const title = removePublisherSuffix(getXmlText(item.title), source);
    const url = getXmlText(item.link);
    const publishedAt = new Date(getXmlText(item.pubDate));
    if (!title || !source || !url || Number.isNaN(publishedAt.getTime())) return;
    if (now - publishedAt.getTime() > 24 * 60 * 60 * 1000 || publishedAt.getTime() > now + 5 * 60 * 1000) return;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return;
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "news.google.com"
      || !parsedUrl.pathname.startsWith("/rss/articles/")) return;

    const normalizedTitle = title.toLowerCase();
    if (seenTitles.has(normalizedTitle)) return;
    seenTitles.add(normalizedTitle);
    articles.push({
      title,
      source,
      url: parsedUrl.href,
      publishedAt: publishedAt.toISOString()
    });
  });

  return articles
    .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))
    .slice(0, MAX_ARTICLES);
}

function parseCsvRow(line) {
  const columns = [];
  let column = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        column += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      columns.push(column);
      column = "";
    } else {
      column += character;
    }
  }
  columns.push(column);
  return columns;
}

function parseNseFoSymbols(csv) {
  if (typeof csv !== "string" || !csv.trim()) {
    throw new Error("NSE returned an empty F&O stock list.");
  }
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  const headers = parseCsvRow(lines[0]).map(value => value.trim().toUpperCase());
  const symbolIndex = headers.indexOf("SYMBOL");
  if (symbolIndex < 0) throw new Error("NSE returned an unrecognized F&O stock list.");

  const symbols = new Set();
  for (const line of lines.slice(1)) {
    const symbol = parseCsvRow(line)[symbolIndex]?.trim().toUpperCase();
    if (!symbol || symbol === "SYMBOL" || !/^[A-Z0-9&._-]+$/.test(symbol)
      || /(NIFTY|SENSEX|BANKEX)/.test(symbol)) continue;
    symbols.add(symbol);
  }
  if (!symbols.size) throw new Error("NSE returned no F&O stock symbols.");
  return [...symbols].sort();
}

function calculateRsi(values, period = RSI_PERIOD) {
  if (!Array.isArray(values) || values.length <= period
    || values.some(value => !Number.isFinite(value))) return null;

  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function aggregateClosingPrices(series, interval, timezoneOffsetSeconds) {
  const closesByPeriod = new Map();
  for (const point of series) {
    const marketDate = new Date((point.timestamp + timezoneOffsetSeconds) * 1000);
    let key;
    if (interval === "monthly") {
      key = `${marketDate.getUTCFullYear()}-${String(marketDate.getUTCMonth() + 1).padStart(2, "0")}`;
    } else {
      const monday = new Date(marketDate);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
    }
    closesByPeriod.set(key, point.close);
  }
  return [...closesByPeriod.values()];
}

function parseYahooHistory(item, now = Date.now()) {
  const response = item && item.response && item.response[0];
  const timestamps = response && response.timestamp;
  const closes = response && response.indicators && response.indicators.quote
    && response.indicators.quote[0] && response.indicators.quote[0].close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return { status: "unavailable" };

  const series = timestamps.flatMap((timestamp, index) => (
    Number.isFinite(timestamp) && Number.isFinite(closes[index])
      ? [{ timestamp, close: closes[index] }]
      : []
  ));
  if (series.length <= RSI_PERIOD) return { status: "insufficient" };

  const metadata = response.meta || {};
  const reportedTime = Number(metadata.regularMarketTime);
  const asOf = Number.isFinite(reportedTime) && reportedTime > 0
    ? reportedTime * 1000
    : series[series.length - 1].timestamp * 1000;
  if (asOf > now + 5 * 60 * 1000 || now - asOf > MAX_MARKET_DATA_AGE_MS) {
    return { status: "stale", asOf };
  }

  const timezoneOffset = Number.isFinite(metadata.gmtoffset) ? metadata.gmtoffset : 19800;
  const monthly = calculateRsi(aggregateClosingPrices(series, "monthly", timezoneOffset));
  const weekly = calculateRsi(aggregateClosingPrices(series, "weekly", timezoneOffset));
  const daily = calculateRsi(series.map(point => point.close));
  if (monthly === null || weekly === null || daily === null) return { status: "insufficient", asOf };

  return {
    status: "ok",
    stock: String(metadata.symbol || item.symbol || "").replace(/\.NS$/i, ""),
    monthly,
    weekly,
    daily,
    asOf
  };
}

async function fetchNseFoSymbols() {
  const response = await fetch(NSE_FO_SYMBOLS_URL, {
    headers: {
      Accept: "text/csv,*/*",
      "User-Agent": "FinSightMarketScanner/1.0"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`NSE F&O stock list returned HTTP ${response.status}.`);
  const csv = await response.text();
  if (csv.length > MAX_SYMBOLS_FILE_LENGTH) throw new Error("NSE F&O stock list exceeded the size limit.");
  return parseNseFoSymbols(csv);
}

async function fetchYahooBatch(symbols) {
  const url = new URL(YAHOO_SPARK_URL);
  url.search = new URLSearchParams({
    symbols: symbols.map(symbol => `${symbol}.NS`).join(","),
    range: "2y",
    interval: "1d"
  }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("Yahoo Finance returned an invalid response.");
  }
  if (!response.ok) {
    const reason = payload && payload.spark && payload.spark.error && payload.spark.error.description;
    throw new Error(`Yahoo Finance returned HTTP ${response.status}${reason ? `: ${reason}` : ""}.`);
  }
  if (!payload.spark || !Array.isArray(payload.spark.result)) {
    const reason = payload.spark && payload.spark.error && payload.spark.error.description;
    throw new Error(reason || "Yahoo Finance returned no historical prices.");
  }
  return payload.spark.result;
}

async function fetchMarketScan(dailyRange) {
  if (!SCAN_RANGES.has(dailyRange)) throw new Error("The scan setup has an unsupported daily RSI range.");
  const symbols = await fetchNseFoSymbols();
  const batches = [];
  for (let index = 0; index < symbols.length; index += YAHOO_BATCH_SIZE) {
    batches.push(symbols.slice(index, index + YAHOO_BATCH_SIZE));
  }

  const resultsByBatch = new Array(batches.length);
  let nextBatch = 0;
  await Promise.all(Array.from({ length: Math.min(YAHOO_CONCURRENCY, batches.length) }, async () => {
    while (nextBatch < batches.length) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      try {
        resultsByBatch[batchIndex] = await fetchYahooBatch(batches[batchIndex]);
      } catch (error) {
        resultsByBatch[batchIndex] = [];
        console.warn(`Yahoo Finance batch ${batchIndex + 1}/${batches.length} failed.`, error);
      }
    }
  }));

  const histories = new Map();
  for (const batch of resultsByBatch) {
    for (const item of batch) {
      const history = parseYahooHistory(item);
      if (history.status === "ok") histories.set(history.stock, history);
    }
  }

  if (!histories.size) {
    throw new Error("Yahoo Finance did not return fresh, usable price history for any NSE F&O stocks.");
  }

  const [minimumText, maximumText] = dailyRange.split("-").map(Number);
  const matches = [];
  for (const history of histories.values()) {
    if (history.monthly > 60 && history.weekly > 60
      && history.daily >= minimumText && history.daily <= maximumText) {
      matches.push({
        stock: history.stock,
        monthly: history.monthly,
        weekly: history.weekly,
        daily: history.daily
      });
    }
  }

  return {
    source: "Yahoo Finance",
    fetchedAt: new Date().toISOString(),
    asOf: new Date(Math.min(...[...histories.values()].map(history => history.asOf))).toISOString(),
    totalSymbols: symbols.length,
    fetchedCount: histories.size,
    unavailableCount: symbols.length - histories.size,
    matches: matches.sort((first, second) => first.stock.localeCompare(second.stock))
  };
}

async function fetchGoogleNewsResearch() {
  const feedUrl = new URL("https://news.google.com/rss/search");
  feedUrl.search = new URLSearchParams({
    q: RSS_QUERY,
    hl: "en-IN",
    gl: "IN",
    ceid: "IN:en"
  }).toString();

  const response = await fetch(feedUrl, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "FinSightDailyMarketResearch/1.0"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Google News RSS returned HTTP ${response.status}.`);

  const xml = await response.text();
  if (xml.length > MAX_FEED_LENGTH) throw new Error("Google News RSS response exceeded the size limit.");
  const payload = {
    fetchedAt: new Date().toISOString(),
    articles: parseGoogleNewsFeed(xml)
  };
  cachedResearch = payload;
  cachedUntil = Date.now() + CACHE_DURATION_MS;
  return payload;
}

async function getGoogleNewsResearch() {
  if (cachedResearch && Date.now() < cachedUntil) return cachedResearch;
  if (pendingResearchRequest) return pendingResearchRequest;
  pendingResearchRequest = fetchGoogleNewsResearch();
  try {
    return await pendingResearchRequest;
  } finally {
    pendingResearchRequest = null;
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const requestUrl = new URL(request.url, "http://localhost");

  if (requestUrl.pathname === "/api/scan") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Only GET is supported for scans." });
      return;
    }
    try {
      const result = await fetchMarketScan(requestUrl.searchParams.get("dailyRange"));
      sendJson(response, 200, result);
    } catch (error) {
      console.error("Market scan could not be completed.", error);
      sendJson(response, 502, { error: `Unable to fetch current market data: ${error.message}` });
    }
    return;
  }

  if (requestUrl.pathname === "/api/research") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Only GET is supported for research." });
      return;
    }
    try {
      sendJson(response, 200, await getGoogleNewsResearch());
    } catch (error) {
      console.error("Google News RSS request failed.", error);
      sendJson(response, 502, { error: `Unable to load Google News headlines: ${error.message}` });
    }
    return;
  }

  const asset = request.method === "GET" ? assets.get(requestUrl.pathname) : null;
  if (!asset) {
    sendJson(response, request.method === "GET" ? 404 : 405, { error: "Not found." });
    return;
  }

  try {
    const content = await fs.readFile(path.join(__dirname, asset.file));
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": content.length,
      "Content-Type": asset.type
    });
    response.end(content);
  } catch (error) {
    console.error(`Could not serve ${asset.file}.`, error);
    sendJson(response, 500, { error: "Unable to serve the application." });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`FinSight is available at http://localhost:${PORT}`);
  });
}

module.exports = {
  aggregateClosingPrices,
  calculateRsi,
  parseGoogleNewsFeed,
  parseNseFoSymbols,
  parseYahooHistory
};
