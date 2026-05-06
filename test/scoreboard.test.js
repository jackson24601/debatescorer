const assert = require("node:assert/strict");
const test = require("node:test");

const { ScoreboardError, ScoreboardStore, normalizeRoomId } = require("../src/scoreboard");

function createStore() {
  let nowTick = 0;

  return new ScoreboardStore({
    idGenerator: () => "ROOM42",
    pinGenerator: () => "1234",
    now: () => `2026-05-06T16:00:${String(nowTick++).padStart(2, "0")}.000Z`,
  });
}

test("creates a room with public score data and a separate control PIN", () => {
  const store = createStore();
  const created = store.createRoom({
    title: "Practice debate",
    sides: [{ name: "Ada" }, { name: "Grace" }],
  });

  assert.equal(created.controlPin, "1234");
  assert.deepEqual(created.room, {
    id: "ROOM42",
    title: "Practice debate",
    sides: [
      { id: "affirmative", name: "Ada", score: 0 },
      { id: "negative", name: "Grace", score: 0 },
    ],
    history: [],
    createdAt: "2026-05-06T16:00:00.000Z",
    updatedAt: "2026-05-06T16:00:00.000Z",
  });
  assert.equal(Object.hasOwn(created.room, "controlPin"), false);
});

test("adjusts one point at a time for either debater", () => {
  const store = createStore();
  store.createRoom({ sides: [{ name: "Ada" }, { name: "Grace" }] });

  let room = store.adjustScore("room42", {
    pin: "1234",
    sideId: "affirmative",
    delta: 1,
  });
  room = store.adjustScore("ROOM42", {
    pin: "1234",
    sideId: "negative",
    delta: -1,
  });

  assert.deepEqual(
    room.sides.map((side) => side.score),
    [1, -1],
  );
  assert.deepEqual(room.history[0], {
    sideId: "negative",
    sideName: "Grace",
    delta: -1,
    score: -1,
    at: "2026-05-06T16:00:02.000Z",
  });
});

test("rejects invalid score changes", () => {
  const store = createStore();
  store.createRoom();

  assert.throws(
    () =>
      store.adjustScore("ROOM42", {
        pin: "1234",
        sideId: "affirmative",
        delta: 2,
      }),
    /exactly \+1 or -1/,
  );
});

test("requires the scorer PIN to update or reset scores", () => {
  const store = createStore();
  store.createRoom();

  assert.throws(
    () =>
      store.adjustScore("ROOM42", {
        pin: "0000",
        sideId: "affirmative",
        delta: 1,
      }),
    (error) => error instanceof ScoreboardError && error.statusCode === 401,
  );
});

test("resets both scores to zero", () => {
  const store = createStore();
  store.createRoom();

  store.adjustScore("ROOM42", {
    pin: "1234",
    sideId: "affirmative",
    delta: 1,
  });
  const room = store.resetScores("ROOM42", { pin: "1234" });

  assert.deepEqual(
    room.sides.map((side) => side.score),
    [0, 0],
  );
  assert.equal(room.history[0].type, "reset");
});

test("normalizes room codes for user-entered values", () => {
  assert.equal(normalizeRoomId(" room-42 "), "ROOM42");
});
