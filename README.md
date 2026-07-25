# MTA Service Status Widget for DAKboard

A lightweight, production-ready DAKboard Custom Screen widget that shows overall MTA status and the five most important active service alerts. It does not show train arrivals, bus arrivals, or line countdowns.

## Files

- `index.html` - dashboard markup
- `style.css` - dark, responsive TV-friendly layout
- `app.js` - browser refresh/render logic
- `worker.js` - Cloudflare Worker proxy and MTA feed normalizer
- `README.md` - deployment instructions

## Data Source

The Worker fetches the official MTA GTFS-Realtime service alerts JSON feed:

```text
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json
```

The Worker normalizes the feed to:

```json
{
  "updated": "2026-07-25T14:35:00Z",
  "subway": "Good Service",
  "bus": "Good Service",
  "lirr": "Minor Delays",
  "metroNorth": "Good Service",
  "alerts": [
    {
      "service": "Subway",
      "status": "Delay",
      "summary": "Signal problems causing delays in Midtown Manhattan.",
      "updated": "2026-07-25T14:34:00Z"
    }
  ]
}
```

## Deploy the Cloudflare Worker

1. Install Wrangler:

```bash
npm install -g wrangler
```

2. Log in:

```bash
wrangler login
```

3. Create a `wrangler.toml` next to `worker.js`:

```toml
name = "mta-service-status"
main = "worker.js"
compatibility_date = "2026-07-25"
```

4. Deploy:

```bash
wrangler deploy
```

5. Confirm the endpoint works:

```text
https://mta-service-status.<your-subdomain>.workers.dev/status
```

## Host the Widget

### GitHub Pages

1. Create a GitHub repository and upload `index.html`, `style.css`, and `app.js`.
2. In the repository settings, enable Pages for the main branch.
3. Use this URL format, replacing the `api` value with your Worker URL:

```text
https://<username>.github.io/<repo>/?api=https%3A%2F%2Fmta-service-status.<your-subdomain>.workers.dev%2Fstatus
```

### Cloudflare Pages

1. Create a Cloudflare Pages project.
2. Upload or connect the folder containing `index.html`, `style.css`, and `app.js`.
3. Set build command to blank and output directory to `/`.
4. Use this URL format:

```text
https://<pages-project>.pages.dev/?api=https%3A%2F%2Fmta-service-status.<your-subdomain>.workers.dev%2Fstatus
```

## Add to DAKboard

1. Open DAKboard.
2. Edit your Custom Screen.
3. Add a URL block or embedded website block.
4. Paste the hosted widget URL with the `api=` parameter.
5. Set the block to refresh normally. The widget refreshes MTA data every 60 seconds on its own.

## Local Preview

Open `index.html` directly in a browser to preview the layout with a no-alert demo state.

To preview against a deployed Worker, open:

```text
index.html?api=https%3A%2F%2Fmta-service-status.<your-subdomain>.workers.dev%2Fstatus
```

## Notes

- No frameworks or build step are required.
- The Worker caches responses for 45 seconds to keep the widget fast and reduce repeated feed calls.
- If the MTA feed is unavailable, the widget displays `⚠ Unable to retrieve MTA status` and retries every 60 seconds.
