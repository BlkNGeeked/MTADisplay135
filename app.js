const REFRESH_MS = 60_000;
const PARAMS = new URLSearchParams(window.location.search);
const API_URL = PARAMS.get("api") || window.MTA_STATUS_API || "/status";
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

async function fetchStatus() {
  try {
    if (IS_LOCAL_PREVIEW) {
      render(sampleStatus);
      return;
    }

    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`MTA status request failed: ${response.status}`);
    const data = await response.json();
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
