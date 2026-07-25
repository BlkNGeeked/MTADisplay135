const MTA_ALERTS_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json";
const CACHE_TTL_SECONDS = 45;

const DEFAULT_STATUS = {
  subway: "Good Service",
  bus: "Good Service",
  lirr: "Good Service",
  metroNorth: "Good Service",
};

const SERVICE_MATCHERS = [
  {
    key: "subway",
    label: "Subway",
    agency: /MTASBWY|SUBWAY|SBWY/i,
    route: /^(A|B|C|D|E|F|G|J|L|M|N|Q|R|S|W|Z|[1-7]|FS|GS|H|SI)$/i,
  },
  {
    key: "bus",
    label: "Bus",
    agency: /MTA\s?NYCT|MTABC|bus/i,
    route: /^(B|BX|BM|M|Q|QM|S|SIM|X)\d/i,
  },
  {
    key: "lirr",
    label: "LIRR",
    agency: /LIRR|Long Island/i,
    route: /^(Babylon|Belmont|City Terminal|Far Rockaway|Hempstead|Long Beach|Montauk|Oyster Bay|Port Jefferson|Port Washington|Ronkonkoma|West Hempstead|LIRR)/i,
  },
  {
    key: "metroNorth",
    label: "Metro-North",
    agency: /MNR|Metro-North|Metro North/i,
    route: /^(Harlem|Hudson|New Haven|Pascack|Port Jervis|MNR)/i,
  },
];

const SEVERITY = {
  "good service": 0,
  "on or close": 0,
  "station notice": 1,
  "boarding change": 1,
  "planned work": 1,
  "planned - detour": 1,
  "planned - stops skipped": 1,
  "planned - substitute buses": 1,
  "planned - boarding change": 1,
  "service change": 1,
  "special schedule": 1,
  "weekday service": 1,
  "weekend schedule": 1,
  "saturday schedule": 1,
  "sunday schedule": 1,
  "special event": 1,
  "some delays": 2,
  "minor delays": 2,
  "expect delays": 2,
  delays: 2,
  cancellations: 2,
  "trains rerouted": 2,
  reroute: 2,
  "slow speeds": 2,
  "major service change": 3,
  suspended: 3,
  "part suspended": 3,
  "planned - part suspended": 3,
  "reduced service": 3,
  "no scheduled service": 3,
  "multiple impacts": 3,
};

const STATUS_BY_SEVERITY = ["Good Service", "Planned Work", "Delays", "Major Service Change"];

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

      const feed = await upstream.json();
      const payload = normalizeFeed(feed);
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
          ...DEFAULT_STATUS,
          alerts: [],
        },
        502,
      );
    }
  },
};

function normalizeFeed(feed) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const updated = feed?.header?.timestamp
    ? new Date(Number(feed.header.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const status = { ...DEFAULT_STATUS };
  const statusSeverity = {
    subway: 0,
    bus: 0,
    lirr: 0,
    metroNorth: 0,
  };

  const alerts = (feed?.entity || [])
    .map((entity) => normalizeAlert(entity, nowSeconds))
    .filter(Boolean);

  alerts.forEach((alert) => {
    const key = SERVICE_MATCHERS.find((service) => service.label === alert.service)?.key;
    if (!key) return;

    const rank = severityRank(alert.status);
    if (rank > statusSeverity[key]) {
      statusSeverity[key] = rank;
      status[key] = STATUS_BY_SEVERITY[rank];
    }
  });

  const topAlerts = dedupeAlerts(alerts)
    .sort((a, b) => b.priority - a.priority || new Date(b.updated) - new Date(a.updated))
    .slice(0, 5)
    .map(({ priority, ...alert }) => alert);

  return {
    updated,
    ...status,
    alerts: topAlerts,
  };
}

function normalizeAlert(entity, nowSeconds) {
  const alert = entity?.alert;
  if (!alert || !isActive(alert.active_period, nowSeconds)) return null;

  const mercury = alert["transit_realtime.mercury_alert"] || {};
  const status = titleCase(mercury.alert_type || "Service Change");
  const service = detectService(alert.informed_entity || []);
  if (!service) return null;

  const summary = cleanText(
    readTranslatedText(mercury.screens_summary) ||
      readTranslatedText(alert.header_text) ||
      readTranslatedText(alert.description_text) ||
      "Service alert in effect.",
  );

  const updatedSeconds = Number(mercury.updated_at || mercury.created_at || alert.active_period?.[0]?.start);
  const updated = updatedSeconds ? new Date(updatedSeconds * 1000).toISOString() : new Date().toISOString();

  return {
    service,
    status,
    summary: truncate(summary, 190),
    updated,
    priority: severityRank(status),
  };
}

function detectService(entities) {
  for (const entity of entities) {
    const agency = entity.agency_id || "";
    const route = entity.route_id || "";
    const match = SERVICE_MATCHERS.find((service) => service.agency.test(agency) || service.route.test(route));
    if (match) return match.label;
  }

  return null;
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

function severityRank(status) {
  const key = String(status).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SEVERITY, key)) return SEVERITY[key];
  if (/suspended|major|reduced|multiple impacts|no scheduled/.test(key)) return 3;
  if (/delay|reroute|cancel|slow/.test(key)) return 2;
  if (/planned|change|detour|notice|schedule|event|boarding/.test(key)) return 1;
  return 0;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = `${alert.service}:${alert.status}:${alert.summary}`;
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
