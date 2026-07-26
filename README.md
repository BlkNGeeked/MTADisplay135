# 2 and 3 Train Status Widget for DAKboard

A lightweight DAKboard widget that shows whether the MTA subway `2` and `3` trains have `Good Service`, are `Delayed`, are `Reroute`, or are `Suspended`. It only displays alerts that affect the `2` or `3` train.

## Files

- `index.html` - dashboard markup
- `style.css` - dark, responsive TV-friendly layout
- `app.js` - browser refresh/render logic and 2/3 train filtering
- `worker.js` - optional Cloudflare Worker proxy
- `README.md` - deployment instructions

## Data Source

By default, the widget fetches the official MTA subway service alerts JSON feed directly:

```text
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json
```

The widget filters the feed to `2` and `3` train alerts and normalizes them to:

```json
{
  "updated": "2026-07-25T14:35:00Z",
  "lines": {
    "2": "Good Service",
    "3": "Delayed"
  },
  "alerts": [
    {
      "routes": ["3"],
      "status": "Suspended",
      "summary": "3 trains are suspended.",
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
