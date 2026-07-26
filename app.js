const REFRESH_MS = 60_000;
const MTA_FEED_URL = "https://mtadisplay.mr-dfordbreezy.workers.dev/status";
const PARAMS = new URLSearchParams(window.location.search);
const API_URL = PARAMS.get("api") || window.MTA_STATUS_API || MTA_FEED_URL;
const WATCHED_LINES = ["2", "3"];

const sampleData = {
  updated: new Date().toISOString(),
  lines: {
    2: "Good Service",
    3: "Good Service",
  },
  alerts: [],
};

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = `${alert.routes.join(",")}:${alert.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderCards(lines) {
  WATCHED_LINES.forEach((line) => {
    const card = document.querySelector(`[data-line="${line}"]`);
    const status = lines?.[line] || "Good Service";
    const className = status.toLowerCase().replace(/\s+/g, "-");

    card.className = `line-card ${className}`;
    card.querySelector(".line-status").textContent = status;
  });
}

function renderAlerts(alerts) {
  const list = document.getElementById("alertsList");
  const count = document.getElementById("alertCount");
  list.innerHTML = "";
  count.textContent = String(alerts.length);

  if (!alerts.length) {
    list.innerHTML = '<p class="empty-state">No active alerts for the 2 or 3 train.</p>';
    return;
  }

  alerts.forEach((alert) => {
    const item = document.createElement("article");
    item.className = "alert-item";

    const routes = document.createElement("div");
    routes.className = "alert-routes";
    routes.textContent = alert.routes.join(" ");

    const summary = document.createElement("div");
    summary.className = "alert-summary";
    summary.textContent = alert.summary;

    const time = document.createElement("time");
    time.className = "alert-time";
    time.dateTime = alert.updated;
    time.textContent = formatDateTime(alert.updated);

    item.append(routes, summary, time);
    list.appendChild(item);
  });
}

function render(data, hasError = false) {
  document.getElementById("errorBanner").hidden = !hasError;
  document.getElementById("lastUpdated").textContent = `Updated: ${formatTime(data.updated)}`;
  renderCards(data.lines);
  renderAlerts(data.alerts || []);
}

async function fetchStatus() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`MTA status request failed: ${response.status}`);
    const data = await response.json();
    render(data?.entity ? normalizeMtaFeed(data) : data);
  } catch (error) {
    console.warn(error);
    render(
      {
        ...sampleData,
        updated: new Date().toISOString(),
      },
      true,
    );
  }
}

fetchStatus();
setInterval(fetchStatus, REFRESH_MS);
