"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  aggregateClosingPrices,
  calculateRsi,
  parseGoogleNewsFeed,
  parseNseFoSymbols
} = require("./server");

function rssItem({ title, link, publishedAt, source }) {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${publishedAt}</pubDate><source url="https://publisher.example">${source}</source></item>`;
}

test("parses recent Google News items, removes publisher suffixes, and rejects stale or non-Google links", () => {
  const now = new Date("2026-11-23T10:00:00Z").getTime();
  const xml = `<rss><channel>
    ${rssItem({
      title: "NIFTY falls after banking shares slide - Daily News",
      link: "https://news.google.com/rss/articles/recent",
      publishedAt: "Mon, 23 Nov 2026 09:00:00 GMT",
      source: "Daily News"
    })}
    ${rssItem({
      title: "Market update - Old News",
      link: "https://news.google.com/rss/articles/old",
      publishedAt: "Sun, 22 Nov 2026 07:00:00 GMT",
      source: "Old News"
    })}
    ${rssItem({
      title: "Market update - Other Site",
      link: "https://publisher.example/article",
      publishedAt: "Mon, 23 Nov 2026 09:30:00 GMT",
      source: "Other Site"
    })}
  </channel></rss>`;

  assert.deepEqual(parseGoogleNewsFeed(xml, now), [{
    title: "NIFTY falls after banking shares slide",
    source: "Daily News",
    url: "https://news.google.com/rss/articles/recent",
    publishedAt: "2026-11-23T09:00:00.000Z"
  }]);
});

test("rejects an invalid RSS document", () => {
  assert.throws(() => parseGoogleNewsFeed("<rss><channel></rss>"), /invalid RSS feed/i);
});

test("parses unique stock symbols from the NSE F&O list and excludes index contracts", () => {
  const csv = [
    "UNDERLYING,SYMBOL,LOT SIZE",
    "NIFTY 50,NIFTY,65",
    "RELIANCE INDUSTRIES,RELIANCE,250",
    "M&M LIMITED,M&M,100",
    "Derivatives on Individual Securities,Symbol,",
    "RELIANCE INDUSTRIES,RELIANCE,250",
    "NIFTY FINANCIAL SERVICES,FINNIFTY,60"
  ].join("\n");

  assert.deepEqual(parseNseFoSymbols(csv), ["M&M", "RELIANCE"]);
  assert.throws(() => parseNseFoSymbols("UNDERLYING,LOT SIZE\nReliance,250"), /unrecognized/i);
});

test("calculates Wilder RSI and returns null until enough closes are available", () => {
  assert.equal(calculateRsi(Array.from({ length: 15 }, (_, index) => index + 1)), 100);
  assert.equal(calculateRsi(Array.from({ length: 15 }, (_, index) => 15 - index)), 0);
  assert.equal(calculateRsi(Array(15).fill(10)), 50);
  assert.equal(calculateRsi(Array(14).fill(10)), null);
});

test("aggregates the latest close into exchange-local week and month buckets", () => {
  const series = [
    ["2026-01-26T09:15:00Z", 10],
    ["2026-01-30T09:15:00Z", 11],
    ["2026-02-02T09:15:00Z", 12],
    ["2026-02-03T09:15:00Z", 13]
  ].map(([date, close]) => ({ timestamp: Date.parse(date) / 1000, close }));

  assert.deepEqual(aggregateClosingPrices(series, "weekly", 0), [11, 13]);
  assert.deepEqual(aggregateClosingPrices(series, "monthly", 0), [11, 13]);
});
