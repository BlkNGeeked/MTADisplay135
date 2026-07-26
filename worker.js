const MTA_ALERTS_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
const CACHE_TTL_SECONDS = 45;
const WATCHED_LINES = ["2", "3"];

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return corsResponse(null, 204);

    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/status") {
      return corsResponse({ error: "Not found" }, 404);
    }

    const cache = caches.default;
    const cacheKey = new Request(url.origin + "/status");
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const upstream = await fetch(MTA_ALERTS_URL, {
        headers: { accept: "application/json" },
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      });

      if (!upstream.ok) throw new Error(`MTA returned ${upstream.status}`);

      const payload = normalizeMtaFeed(await upstream.json());
      const response = corsResponse(payload, 200, {
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      return corsResponse(
        {
          error: "Unable to retrieve MTA status",
          updated: new Date().toISOString(),
          lines: {
            2: "Good Service",
            3: "Good Service",
          },
          alerts: [],
        },
        502,
      );
    }
  },
};

function normalizeMtaFeed(feed) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const updated = feed.header?.timestamp
    ? new Date(Number(feed.header.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const lines = {
    2: "Good Service",
    3: "Good Service",
  };

  const alerts = (feed.entity || [])
    .map((entity) => {
      const alert = entity.alert;
      if (!alert || !isActive(alert.active_period, nowSeconds)) return null;

      const routes = WATCHED_LINES.filter((line) => hasWatchedRoute(alert, line));
      if (!routes.length) return null;

      const mercury = alert["transit_realtime.mercury_alert"] || {};
      const status = mercury.alert_type || "Alert";
      const summary = cleanText(readTranslatedText(alert.header_text) || readTranslatedText(alert.description_text));
      const updatedSeconds = Number(mercury.updated_at || mercury.created_at || alert.active_period?.[0]?.start);
      const alertStatus = classifyAlert(status, summary);

      routes.forEach((route) => {
        if (alertStatus === "Suspended") {
          lines[route] = "Suspended";
        } else if (alertStatus === "Reroute" && lines[route] !== "Suspended") {
          lines[route] = "Reroute";
        } else if (alertStatus === "Delayed" && !["Suspended", "Reroute"].includes(lines[route])) {
          lines[route] = "Delayed";
        }
      });

      return {
        routes,
        status: alertStatus,
        summary: truncate(summary || "Service alert in effect.", 190),
        updated: updatedSeconds ? new Date(updatedSeconds * 1000).toISOString() : updated,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));

  return {
    updated,
    lines,
    alerts: dedupeAlerts(alerts).slice(0, 5),
  };
}

function hasWatchedRoute(alert, routeId) {
  return (alert.informed_entity || []).some((entity) => {
    const agency = String(entity.agency_id || "");
    const route = String(entity.route_id || "").toUpperCase();
    return /MTASBWY|SUBWAY|SBWY/i.test(agency) && route === routeId;
  });
}

function classifyAlert(status = "", summary = "") {
  const text = `${status} ${summary}`;

  if (/(suspended|no service|not running|service suspended)/i.test(text)) {
    return "Suspended";
  }

  if (/(reroute|service change|trains run|trains are running|express|local)/i.test(text)) {
    return "Reroute";
  }

  if (/(delay|slow)/i.test(text)) {
    return "Delayed";
  }

  return "Alert";
}

function isActive(periods = [], nowSeconds) {
  if (!periods.length) return true;

  return periods.some((period) => {
    const start = Number(period.start || 0);
    const end = Number(period.end || Number.MAX_SAFE_INTEGER);
    return start <= nowSeconds && nowSeconds <= end;
  });
}

function readTranslatedText(field) {
  const translations = field?.translation || [];
  return translations.find((entry) => entry.language === "en")?.text || translations[0]?.text || "";
}

function cleanText(value) {
  return String(value)
    .replace(/\[[^\]]+\]/g, (match) => match.slice(1, -1))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = `${alert.routes.join(",")}:${alert.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function corsResponse(body, status = 200, headers = {}) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
