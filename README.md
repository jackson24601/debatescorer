# Debate Scorer

A small real-time debate scoring app. One device can act as the scorer and other devices can join the same room as a live display. Score changes are sent immediately to every connected screen.

## Features

- Create a debate room with two debater names
- Use a scorer PIN to control the room from any device
- Add or subtract one point at a time for either debater
- Share a room code with display-only devices
- Live score updates through Server-Sent Events
- No database or third-party packages required

## Run locally

```bash
npm start
```

The app starts on port `3000` by default:

```text
http://localhost:3000
```

You can choose a different port:

```bash
PORT=8080 npm start
```

## Use on multiple devices

1. Start the app on the computer that will host the scoreboard.
2. Open the app in a browser and create a room.
3. Keep the room code and scorer PIN shown after room creation.
4. On another device connected to the same network, open the host computer's network address, for example:

   ```text
   http://192.168.1.25:3000
   ```

5. Enter the room code to watch the live score, or enter the room code plus scorer PIN to control it.

## Tests

```bash
npm test
```

## Notes

Rooms are stored in memory. If the server restarts, active rooms and scores are cleared.
