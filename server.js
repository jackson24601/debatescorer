const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');

const { ScoreboardError, ScoreboardStore } = require('./src/scoreboard');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const store = new ScoreboardStore();
const eventClients = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendError(res, error) {
  if (error instanceof ScoreboardError) {
    sendJson(res, error.statusCode, { error: error.message });
    return;
  }

  console.error(error);
  sendJson(res, 500, { error: 'Something went wrong.' });
}

function requirePublicRoom(roomId) {
  const room = store.getRoom(roomId);

  if (!room) {
    throw new ScoreboardError('Scoreboard room not found.', 404);
  }

  return room;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new ScoreboardError('Request body is too large.', 413));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new ScoreboardError('Request body must be valid JSON.', 400));
      }
    });

    req.on('error', reject);
  });
}

function writeRoomEvent(res, room) {
  res.write(`event: room\ndata: ${JSON.stringify(room)}\n\n`);
}

function broadcastRoom(roomId) {
  const room = store.getRoom(roomId);
  const clients = eventClients.get(roomId);

  if (!room || !clients) {
    return;
  }

  for (const res of clients) {
    writeRoomEvent(res, room);
  }
}

function addEventClient(roomId, res) {
  if (!eventClients.has(roomId)) {
    eventClients.set(roomId, new Set());
  }

  eventClients.get(roomId).add(res);
}

function removeEventClient(roomId, res) {
  const clients = eventClients.get(roomId);

  if (!clients) {
    return;
  }

  clients.delete(res);

  if (clients.size === 0) {
    eventClients.delete(roomId);
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/rooms') {
    const payload = await readJson(req);
    const created = store.createRoom({
      title: payload.title,
      sides: payload.sides,
    });

    sendJson(res, 201, created);
    return;
  }

  const match = pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/([a-z]+))?$/);

  if (!match) {
    sendJson(res, 404, { error: 'API route not found.' });
    return;
  }

  const [, roomId, action] = match;

  if (req.method === 'GET' && !action) {
    sendJson(res, 200, { room: requirePublicRoom(roomId) });
    return;
  }

  if (req.method === 'GET' && action === 'events') {
    const room = requirePublicRoom(roomId);

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    writeRoomEvent(res, room);
    addEventClient(roomId, res);

    req.on('close', () => {
      removeEventClient(roomId, res);
    });
    return;
  }

  if (req.method === 'POST' && action === 'control') {
    const payload = await readJson(req);
    const room = store.verifyControl(roomId, payload.pin);
    sendJson(res, 200, { room });
    return;
  }

  if (req.method === 'POST' && action === 'adjust') {
    const payload = await readJson(req);
    const room = store.adjustScore(roomId, {
      pin: payload.pin,
      sideId: payload.sideId,
      delta: payload.delta,
    });

    sendJson(res, 200, { room });
    broadcastRoom(roomId);
    return;
  }

  if (req.method === 'POST' && action === 'reset') {
    const payload = await readJson(req);
    const room = store.resetScores(roomId, { pin: payload.pin });

    sendJson(res, 200, { room });
    broadcastRoom(roomId);
    return;
  }

  sendJson(res, 404, { error: 'API route not found.' });
}

async function serveStatic(req, res, pathname) {
  const safePathname = pathname === '/' ? '/index.html' : pathname;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, safePathname));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath);
    const type = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
    }[extension] || 'application/octet-stream';

    res.writeHead(200, {
      'content-type': type,
      'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=300',
    });
    res.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(res, 404, { error: 'File not found.' });
      return;
    }

    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    sendError(res, error);
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Debate scorer running at http://${HOST}:${PORT}`);
  });
}

module.exports = { server, store };
