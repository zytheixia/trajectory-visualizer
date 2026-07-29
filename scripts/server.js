import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const PORT = parseInt(process.env.PORT || "5173", 10);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  // Handle API endpoint to list available trace files in directories
  if (pathname === "/api/list-traces") {
    const customDir = reqUrl.searchParams.get("dir") || process.env.TRACE_DIR || "";
    const scanDirs = [];

    if (customDir && fs.existsSync(customDir)) {
      const resolvedCustom = path.resolve(customDir);
      if (fs.statSync(resolvedCustom).isDirectory()) {
        scanDirs.push({ dir: resolvedCustom, tag: "用户目录" });
      } else {
        scanDirs.push({ dir: path.dirname(resolvedCustom), tag: "用户目录" });
      }
    }

    const samplesDir = path.join(rootDir, "samples");
    if (fs.existsSync(samplesDir)) {
      scanDirs.push({ dir: samplesDir, tag: "内置示例" });
    }

    const traceFiles = [];
    const seenPaths = new Set();

    for (const { dir, tag } of scanDirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))) {
            const fullPath = path.join(dir, entry.name);
            if (!seenPaths.has(fullPath)) {
              seenPaths.add(fullPath);
              traceFiles.push({
                name: entry.name,
                path: fullPath,
                tag: tag,
                size: fs.statSync(fullPath).size
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error scanning dir ${dir}:`, err);
      }
    }

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({ customDir, files: traceFiles }));
    return;
  }

  // Handle API endpoint to read local files by path
  if (pathname === "/api/load-file") {
    const filePath = reqUrl.searchParams.get("path");
    if (!filePath) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing 'path' query parameter" }));
      return;
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `File not found: ${resolvedPath}` }));
      return;
    }

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Failed to read file: ${err.message}` }));
    }
    return;
  }

  // Serve static files from rootDir
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/") safePath = "/index.html";

  const localPath = path.join(rootDir, safePath);
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(localPath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`📡 Trajectory Visualizer Server running at http://localhost:${PORT}`);
});
