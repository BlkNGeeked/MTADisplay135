MTA Service Status Widget for DAKboard
A lightweight, production-ready DAKboard Custom Screen widget that shows overall MTA status and the five most important active service alerts. It does not show train arrivals, bus arrivals, or line countdowns.
Files
index.html - dashboard markup
style.css - dark, responsive TV-friendly layout
app.js - browser refresh/render logic
worker.js - Cloudflare Worker proxy and MTA feed normalizer
README.md - deployment instructions
Data Source
The Worker fetches the official MTA GTFS-Realtime service alerts JSON feed:
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json
The Worker normalizes the feed to:
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
Deploy the Cloudflare Worker
Install Wrangler:
npm install -g wrangler
Log in:
wrangler login
Create a wrangler.toml next to worker.js:
name = "mta-service-status"
main = "worker.js"
compatibility_date = "2026-07-25"
Deploy:
wrangler deploy
Confirm the endpoint works:
https://mta-service-status.<your-subdomain>.workers.dev/status
Host the Widget
GitHub Pages
Create a GitHub repository and upload index.html, style.css, and app.js.
In the repository settings, enable Pages for the main branch.
Use this URL format, replacing the api value with your Worker URL:
https://<username>.github.io/<repo>/?api=https%3A%2F%2Fmta-service-status.<your-subdomain>.workers.dev%2Fstatus
Cloudflare Pages
Create a Cloudflare Pages project.
Upload or connect the folder containing index.html, style.css, and app.js.
Set build command to blank and output directory to /.
Use this URL format:
https://<pages-project>.pages.dev/?api=https%3A%2F%2Fmta-service-status.<your-subdomain>.workers.dev%2Fstatus
Add to DAKboard
Open DAKboard.
Edit your Custom Screen.
Add a URL block or embedded website block.
Paste the hosted widget URL with the api= parameter.
Set the block to refresh normally. The widget refreshes MTA data every 60 seconds on its own.
Local Preview
Open index.html directly in a browser to preview the layout with a no-alert demo state.
To preview against a deployed Worker, open:
index.html?api=https%3A%2F%2Fmta-service-status.<your-subdomain>.workers.dev%2Fstatus
Notes
No frameworks or build step are required.
The Worker caches responses for 45 seconds to keep the widget fast and reduce repeated feed calls.
If the MTA feed is unavailable, the widget displays ⚠ Unable to retrieve MTA status and retries every 60 seconds.
