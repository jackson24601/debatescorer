const crypto = require("node:crypto");

const DEFAULT_SIDES = [
  { id: "affirmative", name: "Debater A" },
  { id: "negative", name: "Debater B" },
];

class ScoreboardError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ScoreboardError";
    this.statusCode = statusCode;
  }
}

class ScoreboardStore {
  constructor(options = {}) {
    this.rooms = new Map();
    this.idGenerator = options.idGenerator || generateRoomCode;
    this.pinGenerator = options.pinGenerator || generateControlPin;
    this.now = options.now || (() => new Date().toISOString());
  }

  createRoom(input = {}) {
    const roomId = this.createUniqueRoomId();
    const controlPin = String(this.pinGenerator());
    const sides = normalizeSides(input.sides);
    const createdAt = this.now();

    const room = {
      id: roomId,
      title: normalizeText(input.title, "Debate", 80),
      controlPin,
      sides: sides.map((side) => ({ ...side, score: 0 })),
      history: [],
      createdAt,
      updatedAt: createdAt,
    };

    this.rooms.set(roomId, room);

    return {
      room: this.toPublicRoom(room),
      controlPin,
    };
  }

  getRoom(roomId) {
    const room = this.rooms.get(normalizeRoomId(roomId));
    return room ? this.toPublicRoom(room) : null;
  }

  verifyControl(roomId, pin) {
    const room = this.requireRoom(roomId);
    this.requirePin(room, pin);
    return this.toPublicRoom(room);
  }

  adjustScore(roomId, input = {}) {
    const room = this.requireRoom(roomId);
    this.requirePin(room, input.pin);

    const delta = Number(input.delta);
    if (delta !== 1 && delta !== -1) {
      throw new ScoreboardError("Score changes must be exactly +1 or -1.");
    }

    const side = room.sides.find((candidate) => candidate.id === input.sideId);
    if (!side) {
      throw new ScoreboardError("Unknown debater side.");
    }

    side.score += delta;
    room.updatedAt = this.now();
    room.history.unshift({
      sideId: side.id,
      sideName: side.name,
      delta,
      score: side.score,
      at: room.updatedAt,
    });
    room.history = room.history.slice(0, 50);

    return this.toPublicRoom(room);
  }

  resetScores(roomId, input = {}) {
    const room = this.requireRoom(roomId);
    this.requirePin(room, input.pin);
    const updatedAt = this.now();

    for (const side of room.sides) {
      side.score = 0;
    }

    room.updatedAt = updatedAt;
    room.history.unshift({
      type: "reset",
      at: updatedAt,
    });
    room.history = room.history.slice(0, 50);

    return this.toPublicRoom(room);
  }

  createUniqueRoomId() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const roomId = normalizeRoomId(this.idGenerator());
      if (roomId && !this.rooms.has(roomId)) {
        return roomId;
      }
    }

    throw new ScoreboardError("Could not create a unique room code.", 500);
  }

  requireRoom(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room = this.rooms.get(normalizedRoomId);
    if (!room) {
      throw new ScoreboardError("Scoreboard room not found.", 404);
    }

    return room;
  }

  requirePin(room, pin) {
    if (String(pin || "") !== room.controlPin) {
      throw new ScoreboardError("The scorer PIN is incorrect.", 401);
    }
  }

  toPublicRoom(room) {
    return {
      id: room.id,
      title: room.title,
      sides: room.sides.map(({ id, name, score }) => ({ id, name, score })),
      history: room.history.map((entry) => ({ ...entry })),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }
}

function normalizeSides(inputSides) {
  return DEFAULT_SIDES.map((defaultSide, index) => ({
    id: defaultSide.id,
    name: normalizeText(inputSides?.[index]?.name, defaultSide.name, 40),
  }));
}

function normalizeText(value, fallback, maxLength) {
  const normalized = String(value || "").trim();
  return (normalized || fallback).slice(0, maxLength);
}

function normalizeRoomId(roomId) {
  return String(roomId || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);

  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }

  return code;
}

function generateControlPin() {
  return String(crypto.randomInt(1000, 10000));
}

module.exports = {
  ScoreboardError,
  ScoreboardStore,
  normalizeRoomId,
};
