# Debate Scorer

A hosted real-time debate scoring website. After GitHub Pages is enabled, the site is available at:

```text
https://jackson24601.github.io/debatescorer/
```

No one needs to run a local program to score a debate. Open the website, create a room, then open the same website on another computer and enter the room code.

## Features

- Hosted static website
- Create a debate room with two debater names
- Use a scorer PIN to control the room from any device
- Add or subtract one point at a time for either debater
- Share a room code with display-only devices
- Live score updates through Firebase Realtime Database streaming

## One-time website setup

This repository includes a GitHub Pages deployment workflow in `.github/workflows/deploy-pages.yml`. When changes are merged to `main`, GitHub publishes the static files from `public/`.

### 1. Enable GitHub Pages

In the GitHub repository:

1. Go to **Settings** -> **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Save the setting.

### 2. Connect realtime sync

A static website needs a shared online data store so two computers can see the same score. This site uses Firebase Realtime Database for that shared state; there is still no custom server to run.

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Realtime Database to the project.
3. Copy the database URL. It usually looks like:

   ```text
   https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
   ```

4. In GitHub, go to **Settings** -> **Secrets and variables** -> **Actions**.
5. Add a repository variable or secret named `FIREBASE_DATABASE_URL` with your database URL.
6. For a simple private/practice setup, start with these Realtime Database rules:

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

7. Merge to `main` or run the **Deploy static site to GitHub Pages** workflow.

The scorer PIN is hashed before it is stored, but these sample rules are intentionally simple. Anyone with the website and room code can read room data, so use this for casual scoring rather than sensitive events.

## Use the hosted website

1. Open `https://jackson24601.github.io/debatescorer/`.
2. Create a scoreboard.
3. Keep the room code and scorer PIN shown after room creation.
4. On another computer, open the same website.
5. Enter the room code to watch the live score.
6. Enter the room code plus scorer PIN to control the score from that computer.
7. Press `+1` or `-1`; every connected screen updates automatically.

## Optional local preview for development

This is only for editing or testing the site before deployment:

```bash
npm start
```

Then open `http://127.0.0.1:3000`.

## Tests

```bash
npm test
```
