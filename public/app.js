const {
  adjustScore,
  createRoom,
  normalizeRoomId,
  resetScores,
  verifyRoomPin,
} = window.ScoreboardCore;

const appState = {
  room: null,
  pin: null,
  unsubscribe: null,
  database: null,
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

bootstrap();

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();
  requireDatabase();

  const data = new FormData(createForm);
  const payload = {
    title: data.get("title"),
    sides: [
      { name: data.get("sideA") },
      { name: data.get("sideB") },
    ],
  };
  const created = await createUniqueRoom(payload);

  appState.pin = created.controlPin;
  enterRoom(created.room);
  $("new-room-pin").textContent = created.controlPin;
  $("new-room-details").hidden = false;
  showAlert(`Room ${created.room.id} is ready. Share the room code with viewers.`, "success");
});

watchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();
  requireDatabase();

  const roomId = normalizeRoomId(new FormData(watchForm).get("roomId"));
  const room = await appState.database.getRoom(roomId);

  appState.pin = null;
  enterRoom(room);
});

controlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();
  requireDatabase();

  const data = new FormData(controlForm);
  const roomId = normalizeRoomId(data.get("roomId"));
  const pin = String(data.get("pin") || "").trim();
  const room = await appState.database.getRoom(roomId);
  await verifyRoomPin(room, pin);

  appState.pin = pin;
  enterRoom(room);
});

leaveButton.addEventListener("click", () => {
  disconnectFromRoom();
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

  const latestRoom = await appState.database.getRoom(appState.room.id);
  const nextRoom = await resetScores(latestRoom, { pin: appState.pin });
  await appState.database.saveRoom(nextRoom);
  updateRoom(nextRoom);
});

copyRoomLinkButton.addEventListener("click", async () => {
  if (!appState.room) {
    return;
  }

  const text = `${roomUrl(appState.room.id)}\nRoom code: ${appState.room.id}`;

  try {
    await navigator.clipboard.writeText(text);
    showAlert("Room link and code copied.", "success");
  } catch {
    showAlert(`Share this link and room code: ${text}`, "success");
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-score-action]");
  if (!button || !appState.room || !appState.pin) {
    return;
  }

  clearAlert();
  const latestRoom = await appState.database.getRoom(appState.room.id);
  const nextRoom = await adjustScore(latestRoom, {
    pin: appState.pin,
    sideId: button.dataset.sideId,
    delta: Number(button.dataset.scoreAction),
  });

  await appState.database.saveRoom(nextRoom);
  updateRoom(nextRoom);
});

function bootstrap() {
  const config = window.DebateScorerConfig || {};
  const databaseUrl = String(config.databaseUrl || "").trim();
  const roomId = normalizeRoomId(new URLSearchParams(window.location.search).get("room"));

  if (roomId) {
    for (const input of document.querySelectorAll('input[name="roomId"]')) {
      input.value = roomId;
    }
  }

  if (!databaseUrl) {
    showAlert("Add your Firebase Realtime Database URL in public/config.js before using multi-device scoring.");
    setFormsDisabled(true);
    return;
  }

  appState.database = new FirebaseRoomDatabase(databaseUrl);
  setConnectionStatus("Ready", "idle");
}

async function createUniqueRoom(payload) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const created = await createRoom(payload);
    const existingRoom = await appState.database.findRoom(created.room.id);

    if (!existingRoom) {
      await appState.database.saveRoom(created.room);
      return created;
    }
  }

  throw new Error("Could not create a unique room code. Please try again.");
}

function enterRoom(room) {
  updateRoom(room);
  connectToRoom(room.id);
  render();
}

function updateRoom(room) {
  appState.room = room;
  render();
}

function connectToRoom(roomId) {
  disconnectFromRoom();
  setConnectionStatus("Connecting...", "pending");

  appState.unsubscribe = appState.database.subscribeRoom(
    roomId,
    (room) => {
      if (room) {
        updateRoom(room);
        setConnectionStatus("Live", "live");
      }
    },
    (status) => {
      setConnectionStatus(status, status === "Live" ? "live" : "pending");
    },
  );
}

function disconnectFromRoom() {
  if (appState.unsubscribe) {
    appState.unsubscribe();
    appState.unsubscribe = null;
  }
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
  $("room-link").textContent = roomUrl(room.id);
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

function setFormsDisabled(disabled) {
  for (const element of document.querySelectorAll("form button, form input")) {
    element.disabled = disabled;
  }
}

function requireDatabase() {
  if (!appState.database) {
    throw new Error("The realtime database is not configured yet.");
  }
}

function roomUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

window.addEventListener("unhandledrejection", (event) => {
  showAlert(event.reason?.message || "Something went wrong.");
});

class FirebaseRoomDatabase {
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl.replace(/\/+$/, "");
  }

  async findRoom(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (normalizedRoomId.length !== 6) {
      return null;
    }

    const response = await fetch(this.roomEndpoint(roomId), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Could not load room ${roomId}. Check your Firebase database rules.`);
    }

    return response.json();
  }

  async getRoom(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (normalizedRoomId.length !== 6) {
      throw new Error("Enter a 6-character room code.");
    }

    const room = await this.findRoom(normalizedRoomId);

    if (!room) {
      throw new Error("Scoreboard room not found.");
    }

    return room;
  }

  async saveRoom(room) {
    const response = await fetch(this.roomEndpoint(room.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(room),
    });

    if (!response.ok) {
      throw new Error("Could not save the score. Check your Firebase database rules.");
    }

    return response.json();
  }

  subscribeRoom(roomId, onRoom, onStatus) {
    const events = new EventSource(this.roomEndpoint(roomId));
    let currentRoom = null;

    events.addEventListener("open", () => onStatus("Live"));
    events.addEventListener("error", () => onStatus("Reconnecting..."));
    events.addEventListener("put", (event) => {
      const message = JSON.parse(event.data);
      currentRoom = applyFirebaseMessage(currentRoom, message);
      onRoom(currentRoom);
    });
    events.addEventListener("patch", (event) => {
      const message = JSON.parse(event.data);
      currentRoom = applyFirebaseMessage(currentRoom, message);
      onRoom(currentRoom);
    });

    return () => events.close();
  }

  roomEndpoint(roomId) {
    return `${this.databaseUrl}/rooms/${encodeURIComponent(normalizeRoomId(roomId))}.json`;
  }
}

function applyFirebaseMessage(currentRoom, message) {
  if (message.path === "/") {
    return message.data;
  }

  const nextRoom = JSON.parse(JSON.stringify(currentRoom || {}));
  const keys = message.path.split("/").filter(Boolean);
  let target = nextRoom;

  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }

    target = target[key];
  }

  target[keys[keys.length - 1]] = message.data;
  return nextRoom;
}
