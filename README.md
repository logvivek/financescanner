# FinSight Finance Scanner

## Run locally

Requires Node.js 20 or later.

```text
npm install
npm start
```

Open `http://localhost:3000`. In Daily Market Research, click **Refresh headlines** to request up to five recent NSE/BSE-related articles from the Google News RSS feed. The app does not fetch until clicked.

Every **Run scan** request fetches the current NSE F&O symbol list and requests two years of daily price history from Yahoo Finance. It calculates Wilder RSI(14) on daily closes and closes aggregated by week and month, then applies the selected setup. Yahoo Finance access is unofficial and its quotes may be delayed or unavailable; a successful request is not a guarantee of real-time prices. The scan reports its data timestamp and any symbols it could not fetch.

The feed provides headlines, publisher names, article links, and publication dates. It does not assess affected sectors/stocks or NIFTY impact; those fields are explicitly marked as unassessed. Global closes are not supplied by this feed. Verify articles at their publishers.

Google's RSS response is marked for personal, non-commercial use only. This Node server is required for market scans and the news feed; GitHub Pages alone can serve the static files but cannot run the API endpoints.

## Tests

```text
npm test
```
