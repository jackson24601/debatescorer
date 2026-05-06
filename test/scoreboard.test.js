const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ScoreboardError,
  adjustScore,
  createRoom,
  normalizeRoomId,
  resetScores,
  verifyRoomPin,
} = require("../public/scoreboard-core");

function createOptions() {
  let nowTick = 0;

  return {
    roomId: "ROOM42",
    controlPin: "1234",
    now: () => `2026-05-06T16:00:${String(nowTick++).padStart(2, "0")}.000Z`,
  };
}

test("creates a static room with public score data and a hashed PIN", async () => {
  const created = await createRoom({
    title: "Practice debate",
    sides: [{ name: "Ada" }, { name: "Grace" }],
    ...createOptions(),
  });

  assert.equal(created.controlPin, "1234");
  assert.equal(created.room.id, "ROOM42");
  assert.equal(created.room.title, "Practice debate");
  assert.deepEqual(created.room.sides, [
    { id: "affirmative", name: "Ada", score: 0 },
    { id: "negative", name: "Grace", score: 0 },
  ]);
  assert.equal(created.room.history.length, 0);
  assert.equal(created.room.controlPin, undefined);
  assert.equal(typeof created.room.controlPinHash, "string");
  assert.notEqual(created.room.controlPinHash, "1234");
});

test("adjusts one point at a time for either debater", async () => {
  const options = createOptions();
  const created = await createRoom({ sides: [{ name: "Ada" }, { name: "Grace" }], ...options });

  let room = await adjustScore(created.room, {
    pin: "1234",
    sideId: "affirmative",
    delta: 1,
    now: options.now,
  });
  room = await adjustScore(room, {
    pin: "1234",
    sideId: "negative",
    delta: -1,
    now: options.now,
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

test("rejects invalid score changes", async () => {
  const created = await createRoom(createOptions());

  await assert.rejects(
    () =>
      adjustScore(created.room, {
        pin: "1234",
        sideId: "affirmative",
        delta: 2,
      }),
    /exactly \+1 or -1/,
  );
});

test("requires the scorer PIN to update or reset scores", async () => {
  const created = await createRoom(createOptions());

  await assert.rejects(
    () =>
      adjustScore(created.room, {
        pin: "0000",
        sideId: "affirmative",
        delta: 1,
      }),
    (error) => error instanceof ScoreboardError && /incorrect/.test(error.message),
  );
});

test("resets both scores to zero", async () => {
  const options = createOptions();
  const created = await createRoom(options);

  const scored = await adjustScore(created.room, {
    pin: "1234",
    sideId: "affirmative",
    delta: 1,
    now: options.now,
  });
  const room = await resetScores(scored, { pin: "1234", now: options.now });

  assert.deepEqual(
    room.sides.map((side) => side.score),
    [0, 0],
  );
  assert.equal(room.history[0].type, "reset");
});

test("verifies a scorer PIN without revealing the PIN", async () => {
  const created = await createRoom(createOptions());

  await assert.doesNotReject(() => verifyRoomPin(created.room, "1234"));
  await assert.rejects(() => verifyRoomPin(created.room, "0000"), /incorrect/);
});

test("normalizes room codes for user-entered values", () => {
  assert.equal(normalizeRoomId(" room-42 "), "ROOM42");
});
