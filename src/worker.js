// Serveur de l'appli (Cloudflare Worker).
//  /api/search?s=<vendeur>&q=<texte>&p=<page>  → albums trouvés chez un vendeur
//  /api/albums?s=<vendeur>&p=<page>            → albums d'un vendeur (parcourir)
//  /api/album?s=<vendeur>&id=<album>           → photos + liens d'un album
//  /img?u=<url photo.yupoo.com>                → proxy d'image (Yupoo bloque l'affichage hors de son site)
//  tout le reste                               → fichiers de l'appli (dossier public/)

import { STORE_RE, urls, parseAlbumList, parsePageCount, parseStoreName, parseAlbum } from "./yupoo.js";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const json = (data, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "access-control-allow-origin": "*",
    },
  });

async function getHtml(url, store) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      referer: `https://${store}.x.yupoo.com/`,
    },
    redirect: "follow",
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, `Yupoo a répondu ${res.status}`);
  const html = await res.text();
  // Vendeur inexistant : Yupoo renvoie une page générique sans galerie
  if (!/x\.yupoo\.com|photo\.yupoo\.com/.test(html)) throw new HttpError(502, "Page Yupoo inattendue");
  return html;
}

class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

function needStore(sp) {
  const s = (sp.get("s") || "").toLowerCase().trim();
  if (!STORE_RE.test(s)) throw new HttpError(400, "Vendeur invalide");
  return s;
}

const page = (sp) => Math.min(Math.max(parseInt(sp.get("p") || "1", 10) || 1, 1), 500);

async function api(path, sp) {
  if (path === "/api/search") {
    const s = needStore(sp);
    const q = (sp.get("q") || "").trim().slice(0, 100);
    if (!q) throw new HttpError(400, "Recherche vide");
    const html = await getHtml(urls.search(s, q, page(sp)), s);
    return json({ store: s, name: parseStoreName(html), pages: parsePageCount(html), albums: parseAlbumList(html) }, 200, 600);
  }
  if (path === "/api/albums") {
    const s = needStore(sp);
    const html = await getHtml(urls.albums(s, page(sp)), s);
    return json({ store: s, name: parseStoreName(html), pages: parsePageCount(html), albums: parseAlbumList(html) }, 200, 1800);
  }
  if (path === "/api/album") {
    const s = needStore(sp);
    const id = sp.get("id") || "";
    if (!/^\d{1,15}$/.test(id)) throw new HttpError(400, "Album invalide");
    const html = await getHtml(urls.album(s, id), s);
    return json({ store: s, id, url: urls.album(s, id), ...parseAlbum(html) }, 200, 3600);
  }
  throw new HttpError(404, "Route inconnue");
}

async function image(sp, ctx) {
  const u = sp.get("u") || "";
  const m = u.match(/^https:\/\/photo\.yupoo\.com\/([a-z0-9-]+)\/[A-Za-z0-9._\/-]+$/);
  if (!m) return new Response("bad url", { status: 400 });
  const cache = caches.default;
  const key = new Request(`https://img.cache/${u}`);
  let res = await cache.match(key);
  if (res) return res;
  const up = await fetch(u, {
    headers: { referer: `https://${m[1]}.x.yupoo.com/`, "user-agent": UA },
    cf: { cacheTtl: 2592000, cacheEverything: true },
  });
  if (!up.ok || !(up.headers.get("content-type") || "").startsWith("image/")) {
    return new Response("image indisponible", { status: 502 });
  }
  res = new Response(up.body, {
    headers: {
      "content-type": up.headers.get("content-type"),
      "cache-control": "public, max-age=2592000, immutable",
      "access-control-allow-origin": "*",
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(url.pathname, url.searchParams);
      if (url.pathname === "/img") return await image(url.searchParams, ctx);
    } catch (e) {
      return json({ error: e.message || "Erreur" }, e.status || 500);
    }
    return env.ASSETS.fetch(request);
  },
};
