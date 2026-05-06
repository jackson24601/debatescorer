const appState = {
  room: null,
  pin: null,
  eventSource: null,
};

const $ = (id) => document.getElementById(id);

const homeView = $("home-view");
const roomView = $("room-view");
const createForm = $("create-form");
const watchForm = $("watch-form");
const controlForm = $("control-form");
const leaveButton = $("leave-button");
const resetButton = $("reset-button");
const copyRoomLinkButton = $("copy-room-link");
const connectionStatus = $("connection-status");
const alertBox = $("alert");

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();

  const data = new FormData(createForm);
  const payload = {
    title: data.get("title"),
    sides: [
      { name: data.get("sideA") },
      { name: data.get("sideB") },
    ],
  };

  const response = await apiRequest("/api/rooms", {
    method: "POST",
    body: payload,
  });

  appState.pin = response.controlPin;
  enterRoom(response.room);
  $("new-room-pin").textContent = response.controlPin;
  $("new-room-details").hidden = false;
  showAlert(`Room ${response.room.id} is ready. Share the room code with viewers.`, "success");
});

watchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();

  const roomId = normalizeRoomId(new FormData(watchForm).get("roomId"));
  const response = await apiRequest(`/api/rooms/${roomId}`);

  appState.pin = null;
  enterRoom(response.room);
});

controlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();

  const data = new FormData(controlForm);
  const roomId = normalizeRoomId(data.get("roomId"));
  const pin = String(data.get("pin") || "").trim();
  const response = await apiRequest(`/api/rooms/${roomId}/control`, {
    method: "POST",
    body: { pin },
  });

  appState.pin = pin;
  enterRoom(response.room);
});

leaveButton.addEventListener("click", () => {
  if (appState.eventSource) {
    appState.eventSource.close();
  }

  appState.room = null;
  appState.pin = null;
  render();
});

resetButton.addEventListener("click", async () => {
  if (!appState.room || !appState.pin) {
    return;
  }

  if (!confirm("Reset both debaters to zero?")) {
    return;
  }

  const response = await apiRequest(`/api/rooms/${appState.room.id}/reset`, {
    method: "POST",
    body: { pin: appState.pin },
  });

  updateRoom(response.room);
});

copyRoomLinkButton.addEventListener("click", async () => {
  if (!appState.room) {
    return;
  }

  const text = `${window.location.origin}\nRoom code: ${appState.room.id}`;

  try {
    await navigator.clipboard.writeText(text);
    showAlert("Room link and code copied.", "success");
  } catch {
    showAlert(`Share this address and room code: ${text}`, "success");
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-score-action]");
  if (!button || !appState.room || !appState.pin) {
    return;
  }

  clearAlert();
  const response = await apiRequest(`/api/rooms/${appState.room.id}/adjust`, {
    method: "POST",
    body: {
      pin: appState.pin,
      sideId: button.dataset.sideId,
      delta: Number(button.dataset.scoreAction),
    },
  });

  updateRoom(response.room);
});

function enterRoom(room) {
  updateRoom(room);
  connectToRoomEvents(room.id);
  render();
}

function updateRoom(room) {
  appState.room = room;
  render();
}

function connectToRoomEvents(roomId) {
  if (appState.eventSource) {
    appState.eventSource.close();
  }

  appState.eventSource = new EventSource(`/api/rooms/${roomId}/events`);
  setConnectionStatus("Connecting...", "pending");

  appState.eventSource.addEventListener("open", () => {
    setConnectionStatus("Live", "live");
  });

  appState.eventSource.addEventListener("room", (event) => {
    updateRoom(JSON.parse(event.data));
    setConnectionStatus("Live", "live");
  });

  appState.eventSource.addEventListener("error", () => {
    setConnectionStatus("Reconnecting...", "pending");
  });
}

function render() {
  const room = appState.room;

  homeView.hidden = Boolean(room);
  roomView.hidden = !room;

  if (!room) {
    $("new-room-details").hidden = true;
    setConnectionStatus("Not connected", "idle");
    return;
  }

  $("room-title").textContent = room.title;
  $("room-code").textContent = room.id;
  $("room-code-repeat").textContent = room.id;
  $("room-link").textContent = window.location.origin;
  $("score-mode").textContent = appState.pin ? "Scorer controls enabled" : "Viewer mode";
  $("controller-panel").hidden = !appState.pin;

  const scoreCards = $("score-cards");
  scoreCards.replaceChildren(
    ...room.sides.map((side) => {
      const card = document.createElement("article");
      card.className = "score-card";

      const name = document.createElement("h3");
      name.textContent = side.name;

      const score = document.createElement("p");
      score.className = "score";
      score.textContent = side.score;
      score.setAttribute("aria-label", `${side.name} score`);

      card.append(name, score);
      return card;
    }),
  );

  const controls = $("score-controls");
  controls.replaceChildren(
    ...room.sides.map((side) => {
      const row = document.createElement("div");
      row.className = "control-row";

      const label = document.createElement("span");
      label.textContent = side.name;

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "secondary";
      minus.dataset.sideId = side.id;
      minus.dataset.scoreAction = "-1";
      minus.textContent = "-1";

      const plus = document.createElement("button");
      plus.type = "button";
      plus.dataset.sideId = side.id;
      plus.dataset.scoreAction = "1";
      plus.textContent = "+1";

      row.append(label, minus, plus);
      return row;
    }),
  );

  const history = $("history");
  history.replaceChildren(
    ...room.history.slice(0, 8).map((entry) => {
      const item = document.createElement("li");

      if (entry.type === "reset") {
        item.textContent = "Scores reset to zero";
      } else {
        const sign = entry.delta > 0 ? "+" : "";
        item.textContent = `${entry.sideName}: ${sign}${entry.delta} (now ${entry.score})`;
      }

      return item;
    }),
  );
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function normalizeRoomId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function setConnectionStatus(message, status) {
  connectionStatus.textContent = message;
  connectionStatus.dataset.status = status;
}

function showAlert(message, type = "error") {
  alertBox.textContent = message;
  alertBox.dataset.type = type;
  alertBox.hidden = false;
}

function clearAlert() {
  alertBox.hidden = true;
  alertBox.textContent = "";
}

window.addEventListener("unhandledrejection", (event) => {
  showAlert(event.reason?.message || "Something went wrong.");
});
