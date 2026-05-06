# Debate Scorer

A static real-time debate scoring website. Host the files in `public/` on any static host, connect it to Firebase Realtime Database, then use a room code and scorer PIN to update scores from another computer.

## Features

- Static HTML, CSS, and JavaScript only
- Create a debate room with two debater names
- Use a scorer PIN to control the room from any device
- Add or subtract one point at a time for either debater
- Share a room code with display-only devices
- Live score updates through Firebase Realtime Database streaming

## How the static version works

Static websites cannot keep live state across different computers by themselves. This version keeps the website static and uses Firebase Realtime Database as the shared realtime data store. There is no custom app server to deploy.

## Configure realtime sync

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Realtime Database to the project.
3. Copy the database URL. It usually looks like:

   ```text
   https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
   ```

4. Put that URL in `public/config.js`:

   ```js
   window.DebateScorerConfig = {
     databaseUrl: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
   };
   ```

5. For a simple private/practice setup, start with these Realtime Database rules:

   ```json
   {
     "rules": {
       "rooms": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```

The scorer PIN is hashed before it is stored, but these sample rules are intentionally simple. Anyone with the website and room code can read room data, so use this for casual scoring rather than sensitive events.

## Run locally

```bash
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

This local server only serves the static files from `public/`; it does not provide scoring APIs.

## Deploy as a static website

Deploy the `public/` folder to any static host, for example:

- GitHub Pages
- Netlify
- Vercel static hosting
- Firebase Hosting

After deployment, open the hosted URL in a browser.

## Use on multiple computers

1. Open the deployed website.
2. Create a scoreboard.
3. Keep the room code and scorer PIN shown after room creation.
4. On another computer, open the same website.
5. Enter the room code to watch the live score.
6. Enter the room code plus scorer PIN to control the score from that computer.
7. Press `+1` or `-1`; every connected screen should update automatically.

## Tests

```bash
npm test
```
