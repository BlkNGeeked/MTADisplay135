const MTA_ALERTS_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json";
const CACHE_TTL_SECONDS = 45;

const SUBWAY_ROUTES = new Set([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "R",
  "S",
  "W",
  "Z",
  "FS",
  "GS",
  "H",
  "SI",
]);

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
          suspendedLines: [],
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
  const lines = new Set();

  const alerts = (feed.entity || [])
    .map((entity) => {
      const alert = entity.alert;
      if (!alert || !isActive(alert.active_period, nowSeconds)) return null;

      const mercury = alert["transit_realtime.mercury_alert"] || {};
      const status = titleCase(mercury.alert_type || "");
      const summary = cleanText(readTranslatedText(alert.header_text) || readTranslatedText(alert.description_text));
      const isSuspension = isSuspensionStatus(status) || isSuspensionStatus(summary);
      if (!isSuspension) return null;

      const routes = getSubwayRoutes(alert);
      if (!routes.length) return null;

      routes.forEach((route) => lines.add(route));

      const updatedSeconds = Number(mercury.updated_at || mercury.created_at || alert.active_period?.[0]?.start);

      return {
        routes,
        status: status || "Suspended",
        summary: summary || "Suspended service alert in effect.",
        updated: updatedSeconds ? new Date(updatedSeconds * 1000).toISOString() : updated,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));

  return {
    updated,
    suspendedLines: [...lines].sort(routeSort),
    alerts: dedupeAlerts(alerts).slice(0, 6),
  };
}

function isSuspensionStatus(status = "") {
  return /(suspended|part suspended|no service|no scheduled service)/i.test(status);
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

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function getSubwayRoutes(alert) {
  const routes = new Set();

  (alert.informed_entity || []).forEach((entity) => {
    const agency = String(entity.agency_id || "");
    if (!/MTASBWY|SUBWAY|SBWY/i.test(agency)) return;

    const route = String(entity.route_id || "").trim();
    const normalized = route.toUpperCase();
    if (SUBWAY_ROUTES.has(normalized)) routes.add(normalized);
  });

  return [...routes].sort(routeSort);
}

function routeSort(a, b) {
  const order = [...SUBWAY_ROUTES];
  const aIndex = order.indexOf(a);
  const bIndex = order.indexOf(b);

  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  }

  return a.localeCompare(b, undefined, { numeric: true });
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
