import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".sql": "text/plain" };
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = normalize(join(root, relative));
    if (!file.startsWith(normalize(root))) throw new Error("Invalid path");
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("KataKita: http://127.0.0.1:4173"));