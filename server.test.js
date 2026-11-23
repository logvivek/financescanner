"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseGoogleNewsFeed } = require("./server");

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
