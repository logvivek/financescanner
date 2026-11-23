# FinSight Finance Scanner

## Run locally

Requires Node.js 20 or later.

```text
npm install
npm start
```

Open `http://localhost:3000`. In Daily Market Research, click **Refresh headlines** to request up to five recent NSE/BSE-related articles from the Google News RSS feed. The app does not fetch until clicked.

The feed provides headlines, publisher names, article links, and publication dates. It does not assess affected sectors/stocks or NIFTY impact; those fields are explicitly marked as unassessed. Global closes are not supplied by this feed. Verify articles at their publishers.

Google's RSS response is marked for personal, non-commercial use only. This Node server is required for the feed request; GitHub Pages alone can serve the static files but cannot run the API endpoint.

## Tests

```text
npm test
```
