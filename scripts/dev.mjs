// Serveur local pour tester l'appli sans Cloudflare : node scripts/dev.mjs  →  http://localhost:8787
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import worker from "../src/worker.js";

const root = path.resolve("public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };

// Imitations minimales des API Cloudflare
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const env = {
  ASSETS: {
    async fetch(req) {
      let p = new URL(req.url).pathname;
      if (p === "/") p = "/index.html";
      const file = path.join(root, path.normalize(p));
      try {
        const body = await fs.readFile(file.startsWith(root) ? file : "");
        return new Response(body, { headers: { "content-type": types[path.extname(file)] || "application/octet-stream" } });
      } catch {
        return new Response(await fs.readFile(path.join(root, "index.html")), { headers: { "content-type": types[".html"] } });
      }
    },
  },
};

http.createServer(async (req, res) => {
  const r = await worker.fetch(new Request(`http://localhost:8787${req.url}`), env, { waitUntil() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log("http://localhost:8787"));
