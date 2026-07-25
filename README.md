# MTA Suspended Service Widget for DAKboard

A lightweight DAKboard widget that shows which MTA subway and Staten Island Railway lines currently have suspended or partly suspended service. It does not show train arrivals, bus arrivals, countdowns, or general delay/planned-work alerts.

## Files

- `index.html` - dashboard markup
- `style.css` - dark, responsive TV-friendly layout
- `app.js` - browser refresh/render logic and MTA suspension filtering
- `worker.js` - optional Cloudflare Worker proxy
- `README.md` - deployment instructions

## Data Source

By default, the widget fetches the official MTA GTFS-Realtime service alerts JSON feed directly:

```text
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json
```

The widget filters the feed to suspension-related alerts and normalizes them to:

```json
{
  "updated": "2026-07-25T14:35:00Z",
  "suspendedLines": ["4", "5"],
  "alerts": [
    {
      "routes": ["4", "5"],
      "status": "Part Suspended",
      "summary": "No 4 trains between Bowling Green and Borough Hall.",
      "updated": "2026-07-25T14:34:00Z"
    }
  ]
}
```

## Easiest Deployment: GitHub Pages Only

1. Create a GitHub repository.
2. Upload these files:

- `index.html`
- `style.css`
- `app.js`

3. In GitHub, open the repo settings.
4. Go to **Pages**.
5. Set source to the `main` branch and folder to `/root`.
6. Save.

Your widget URL will look like:

```text
https://<username>.github.io/<repo>/
```

For this project:

```text
https://blkngeeked.github.io/MTADisplay135/
```

## DAKboard Embed Code

Paste this into a DAKboard HTML / Embed block:

```html
<iframe
  src="https://blkngeeked.github.io/MTADisplay135/"
  style="width:100%; height:100%; border:0; overflow:hidden; background:#090c11;"
  scrolling="no"
></iframe>
```

## Optional Cloudflare Worker Backup

The GitHub-only version should work as long as the MTA feed continues allowing browser requests. If DAKboard or a browser blocks the direct MTA request, deploy the Worker and pass it as the `api=` URL parameter.

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

## Host the Widget With Worker Mode

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

## Add to DAKboard With Worker Mode

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
