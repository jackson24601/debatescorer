(function defineScoreboardCore(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ScoreboardCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function createScoreboardCore() {
  const DEFAULT_SIDES = [
    { id: "affirmative", name: "Debater A" },
    { id: "negative", name: "Debater B" },
  ];

  class ScoreboardError extends Error {
    constructor(message) {
      super(message);
      this.name = "ScoreboardError";
    }
  }

  async function createRoom(input = {}) {
    const roomId = normalizeRoomId(input.roomId || generateRoomCode());
    const controlPin = String(input.controlPin || generateControlPin());
    const now = timestamp(input.now);
    const sides = normalizeSides(input.sides);

    return {
      controlPin,
      room: {
        id: roomId,
        title: normalizeText(input.title, "Debate", 80),
        controlPinHash: await hashPin(roomId, controlPin),
        sides: sides.map((side) => ({ ...side, score: 0 })),
        history: [],
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  async function verifyRoomPin(room, pin) {
    if (!room) {
      throw new ScoreboardError("Scoreboard room not found.");
    }

    if (await hashPin(room.id, pin) !== room.controlPinHash) {
      throw new ScoreboardError("The scorer PIN is incorrect.");
    }

    return true;
  }

  async function adjustScore(room, input = {}) {
    await verifyRoomPin(room, input.pin);

    const delta = Number(input.delta);
    if (delta !== 1 && delta !== -1) {
      throw new ScoreboardError("Score changes must be exactly +1 or -1.");
    }

    const nextRoom = cloneRoom(room);
    const side = nextRoom.sides.find((candidate) => candidate.id === input.sideId);
    if (!side) {
      throw new ScoreboardError("Unknown debater side.");
    }

    side.score += delta;
    nextRoom.updatedAt = timestamp(input.now);
    nextRoom.history.unshift({
      sideId: side.id,
      sideName: side.name,
      delta,
      score: side.score,
      at: nextRoom.updatedAt,
    });
    nextRoom.history = nextRoom.history.slice(0, 50);

    return nextRoom;
  }

  async function resetScores(room, input = {}) {
    await verifyRoomPin(room, input.pin);

    const nextRoom = cloneRoom(room);
    nextRoom.updatedAt = timestamp(input.now);

    for (const side of nextRoom.sides) {
      side.score = 0;
    }

    nextRoom.history.unshift({
      type: "reset",
      at: nextRoom.updatedAt,
    });
    nextRoom.history = nextRoom.history.slice(0, 50);

    return nextRoom;
  }

  function cloneRoom(room) {
    return JSON.parse(JSON.stringify(room));
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
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  }

  function generateRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return randomCharacters(alphabet, 6);
  }

  function generateControlPin() {
    const digits = "0123456789";
    return randomCharacters(digits, 4);
  }

  function randomCharacters(alphabet, length) {
    const bytes = randomBytes(length);
    let value = "";

    for (const byte of bytes) {
      value += alphabet[byte % alphabet.length];
    }

    return value;
  }

  function randomBytes(length) {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    }

    if (typeof require === "function") {
      const nodeCrypto = require("node:crypto");
      return nodeCrypto.randomBytes(length);
    }

    return Array.from({ length }, () => Math.floor(Math.random() * 256));
  }

  async function hashPin(roomId, pin) {
    const value = `${normalizeRoomId(roomId)}:${String(pin || "").trim()}`;

    if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return bytesToHex(new Uint8Array(buffer));
    }

    if (typeof require === "function") {
      const nodeCrypto = require("node:crypto");
      return nodeCrypto.createHash("sha256").update(value).digest("hex");
    }

    throw new ScoreboardError("This browser cannot verify scorer PINs.");
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function currentTimestamp() {
    return new Date().toISOString();
  }

  function timestamp(value) {
    if (typeof value === "function") {
      return value();
    }

    return value || currentTimestamp();
  }

  return {
    ScoreboardError,
    adjustScore,
    createRoom,
    generateControlPin,
    generateRoomCode,
    hashPin,
    normalizeRoomId,
    resetScores,
    verifyRoomPin,
  };
});
