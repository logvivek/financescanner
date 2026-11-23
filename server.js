"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { XMLParser } = require("fast-xml-parser");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const RSS_QUERY = "NSE BSE NIFTY India stock market when:1d";
const CACHE_DURATION_MS = 2 * 60 * 1000;
const MAX_FEED_LENGTH = 1024 * 1024;
const MAX_ARTICLES = 5;

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

module.exports = { parseGoogleNewsFeed };
