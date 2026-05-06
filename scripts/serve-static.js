const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

    if (!filePath.startsWith(PUBLIC_DIR)) {
      send(res, 403, "Forbidden");
      return;
    }

    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath);

    res.writeHead(200, {
      "content-type": contentTypes[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=300",
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      send(res, 404, "File not found");
      return;
    }

    console.error(error);
    send(res, 500, "Server error");
  }
});

function send(res, statusCode, message) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

server.listen(PORT, HOST, () => {
  console.log(`Static debate scorer available at http://${HOST}:${PORT}`);
});
