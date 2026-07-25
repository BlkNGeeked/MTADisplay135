const REFRESH_MS = 60_000;
const MTA_FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json";
const PARAMS = new URLSearchParams(window.location.search);
const API_URL = PARAMS.get("api") || window.MTA_STATUS_API || MTA_FEED_URL;
const IS_LOCAL_PREVIEW =
  !PARAMS.has("api") &&
  (window.location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(window.location.hostname));

const SERVICE_LABELS = {
  subway: "Subway",
  bus: "Bus",
  lirr: "LIRR",
  metroNorth: "Metro-North",
};

const sampleStatus = {
  updated: new Date().toISOString(),
  subway: "Good Service",
  bus: "Good Service",
  lirr: "Good Service",
  metroNorth: "Good Service",
  alerts: [],
};

const statusRank = {
  good: 0,
  planned: 1,
  delay: 2,
  major: 3,
};

const serviceMatchers = [
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

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function classifyStatus(status = "") {
  const normalized = status.toLowerCase();

  if (/(suspended|major|no service|part suspended|reduced service)/.test(normalized)) {
    return "major";
  }

  if (/(delay|slow|cancellation|cancelled|canceled|reroute)/.test(normalized)) {
    return "delay";
  }

  if (/(planned|service change|boarding change|detour|station notice|special|schedule|work)/.test(normalized)) {
    return "planned";
  }

  return "good";
}

function normalizeStatusLabel(status = "") {
  const kind = classifyStatus(status);
  if (kind === "major") return /suspend/i.test(status) ? "Suspended" : "Major Service Change";
  if (kind === "delay") return /minor|some|expect/i.test(status) ? "Minor Delays" : "Delays";
  if (kind === "planned") return "Planned Work";
  return "Good Service";
}

function renderCards(data) {
  Object.keys(SERVICE_LABELS).forEach((key) => {
    const card = document.querySelector(`[data-service="${key}"]`);
    if (!card) return;

    const label = normalizeStatusLabel(data[key]);
    const kind = classifyStatus(label);
    card.className = `status-card ${kind}`;
    card.querySelector("p").textContent = label;
  });
}

function renderAlerts(alerts = []) {
  const list = document.getElementById("alertsList");
  const count = document.getElementById("alertCount");
  const visibleAlerts = alerts.slice(0, 5);

  count.textContent = String(visibleAlerts.length);
  list.innerHTML = "";

  if (!visibleAlerts.length) {
    list.innerHTML = '<p class="empty-state">No active systemwide alerts.</p>';
    return;
  }

  visibleAlerts.forEach((alert) => {
    const item = document.createElement("article");
    item.className = `alert-item ${classifyStatus(alert.status)}`;

    const service = document.createElement("div");
    service.className = "alert-service";
    service.textContent = alert.service || "MTA";

    const summary = document.createElement("div");
    summary.className = "alert-summary";
    summary.textContent = alert.summary || "Service alert in effect.";

    const time = document.createElement("time");
    time.className = "alert-time";
    time.dateTime = alert.updated || "";
    time.textContent = formatTime(alert.updated);

    item.append(service, summary, time);
    list.appendChild(item);
  });
}

function render(data, hasError = false) {
  document.getElementById("errorBanner").hidden = !hasError;
  document.getElementById("lastUpdated").textContent = `Updated: ${formatTime(data.updated)}`;
  renderCards(data);
  renderAlerts(data.alerts);
}

function normalizeIncomingData(data) {
  if (data?.entity && data?.header) return normalizeMtaFeed(data);
  return data;
}

function normalizeMtaFeed(feed) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const updated = feed.header?.timestamp
    ? new Date(Number(feed.header.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const status = { ...sampleStatus, updated, alerts: [] };
  const statusSeverity = {
    subway: 0,
    bus: 0,
    lirr: 0,
    metroNorth: 0,
  };

  const alerts = (feed.entity || [])
    .map((entity) => normalizeMtaAlert(entity, nowSeconds))
    .filter(Boolean);

  alerts.forEach((alert) => {
    const service = serviceMatchers.find((matcher) => matcher.label === alert.service);
    if (!service) return;

    const rank = statusRank[classifyStatus(alert.status)];
    if (rank > statusSeverity[service.key]) {
      statusSeverity[service.key] = rank;
      status[service.key] = normalizeStatusLabel(alert.status);
    }
  });

  status.alerts = dedupeAlerts(alerts)
    .sort((a, b) => b.priority - a.priority || new Date(b.updated) - new Date(a.updated))
    .slice(0, 5)
    .map(({ priority, ...alert }) => alert);

  return status;
}

function normalizeMtaAlert(entity, nowSeconds) {
  const alert = entity?.alert;
  if (!alert || !isActive(alert.active_period, nowSeconds)) return null;

  const mercury = alert["transit_realtime.mercury_alert"] || {};
  const service = detectService(alert.informed_entity || []);
  if (!service) return null;

  const status = titleCase(mercury.alert_type || "Service Change");
  const summary = cleanText(
    readTranslatedText(mercury.screens_summary) ||
      readTranslatedText(alert.header_text) ||
      readTranslatedText(alert.description_text) ||
      "Service alert in effect.",
  );
  const updatedSeconds = Number(mercury.updated_at || mercury.created_at || alert.active_period?.[0]?.start);

  return {
    service,
    status,
    summary: truncate(summary, 190),
    updated: updatedSeconds ? new Date(updatedSeconds * 1000).toISOString() : new Date().toISOString(),
    priority: statusRank[classifyStatus(status)],
  };
}

function detectService(entities) {
  for (const entity of entities) {
    const agency = entity.agency_id || "";
    const route = entity.route_id || "";
    const match = serviceMatchers.find((service) => service.agency.test(agency) || service.route.test(route));
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

async function fetchStatus() {
  try {
    if (IS_LOCAL_PREVIEW) {
      render(sampleStatus);
      return;
    }

    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`MTA status request failed: ${response.status}`);
    const data = normalizeIncomingData(await response.json());
    render(data);
  } catch (error) {
    console.warn(error);
    render(
      {
        ...sampleStatus,
        updated: new Date().toISOString(),
      },
      true,
    );
  }
}

fetchStatus();
setInterval(fetchStatus, REFRESH_MS);
