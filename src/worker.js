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
  if (!res.ok) throw new HttpError([404, 429].includes(res.status) ? res.status : 502, `Yupoo a répondu ${res.status}`);
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

const SEARCH_ENGINES = [
  (q) => `https://www.bing.com/search?q=${encodeURIComponent("site:x.yupoo.com " + q)}&count=50&setlang=en`,
  (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent("site:x.yupoo.com " + q)}`,
];
const IGNORED_STORES = new Set(["www", "x", "photo", "s", "m", "api", "help"]);

async function discover(q) {
  const found = new Map(); // store -> { store, albums: [{id, title}] }
  const tried = [];
  for (const mk of SEARCH_ENGINES) {
    const url = mk(q);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA.replace("iPhone; CPU iPhone OS 17_5 like Mac OS X", "Macintosh; Intel Mac OS X 10_15_7"), "accept-language": "en-US,en;q=0.8" }, cf: { cacheTtl: 3600, cacheEverything: true } });
      const html = await res.text();
      tried.push(`${new URL(url).host}:${res.status}`);
      // liens (directs ou encodés dans les redirections du moteur)
      const text = html.replace(/%2F/gi, "/").replace(/%3A/gi, ":").replace(/%3F/gi, "?").replace(/%3D/gi, "=").replace(/%26/gi, "&");
      const re = /https?:\/\/([a-z0-9][a-z0-9-]{1,62})\.x\.yupoo\.com(?:\/albums\/(\d{5,15}))?/gi;
      let m;
      while ((m = re.exec(text))) {
        const store = m[1].toLowerCase();
        if (IGNORED_STORES.has(store)) continue;
        if (!found.has(store)) found.set(store, { store, albums: [] });
        const f = found.get(store);
        if (m[2] && !f.albums.some((a) => a.id === m[2]) && f.albums.length < 6) f.albums.push({ id: m[2] });
      }
      if (found.size >= 5) break;
    } catch (e) {
      tried.push(`${new URL(url).host}:erreur`);
    }
  }
  return { q, engines: tried, stores: [...found.values()].slice(0, 25) };
}

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
  if (path === "/api/preview") {
    // aperçu léger d'un vendeur pour la page d'accueil : 4 dernières couvertures
    const s = needStore(sp);
    const html = await getHtml(urls.albums(s, 1), s);
    const albums = parseAlbumList(html);
    return json({ store: s, pages: parsePageCount(html), covers: albums.filter((a) => a.cover).slice(0, 4).map((a) => a.cover) }, 200, 21600);
  }
  if (path === "/api/rate") {
    // taux de change yuan → euro (mis en cache 12 h), avec une valeur de secours
    let eurPerCny = 0.13, eurPerUsd = 0.92, source = "secours";
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/CNY", { cf: { cacheTtl: 43200, cacheEverything: true } });
      const d = await r.json();
      if (d?.rates?.EUR > 0.05 && d.rates.EUR < 0.3) { eurPerCny = d.rates.EUR; source = "open.er-api.com"; }
      if (d?.rates?.USD > 0.05) eurPerUsd = d.rates.EUR / d.rates.USD;
    } catch {}
    return json({ eurPerCny, eurPerUsd, source }, 200, 43200);
  }
  if (path === "/api/discover") {
    // Trouve d'autres vendeurs Yupoo via un moteur de recherche (site:x.yupoo.com <recherche>)
    const q = (sp.get("q") || "").trim().slice(0, 100);
    if (!q) throw new HttpError(400, "Recherche vide");
    return json(await discover(q), 200, 3600);
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

// Index de la recherche par photo : fichiers publiés chaque nuit par GitHub Actions (release "index")
// Fichier téléchargé une fois puis gardé dans le cache Cloudflare. On met en cache le FICHIER final,
// jamais les redirections : GitHub et Hugging Face redirigent vers des liens signés qui expirent.
async function cachedAsset(key, urls, ttl, contentType, ctx) {
  const cache = caches.default;
  const k = new Request(`https://asset.cache/${key}`);
  const hit = await cache.match(k);
  if (hit) return hit;
  for (const u of urls) {
    try {
      const up = await fetch(u, { redirect: "follow", headers: { "user-agent": "yupoo-finder" } });
      if (!up.ok) continue;
      const res = new Response(up.body, {
        headers: { "content-type": contentType, "cache-control": `public, max-age=${ttl}`, "access-control-allow-origin": "*" },
      });
      ctx.waitUntil(cache.put(k, res.clone()));
      return res;
    } catch {}
  }
  return null;
}

// Index de la recherche par photo : publié chaque nuit par GitHub Actions (release « index »)
async function indexFile(name, env, ctx) {
  if (!["meta.json", "vecs.bin"].includes(name)) return new Response("not found", { status: 404 });
  const repo = env.INDEX_REPO || "lenao85/lenao85";
  // la clé change toutes les 30 min pour récupérer l'index de la nuit
  const slot = Math.floor(Date.now() / 1800000);
  const res = await cachedAsset(`index/${slot}/${name}`, [`https://github.com/${repo}/releases/download/index/${name}`], 1800,
    name.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream", ctx);
  return res || json({ error: "Index pas encore prêt" }, 404);
}

// Modèle photo : copie sur GitHub (release « model ») en priorité, Hugging Face en secours
const MODEL_ASSETS = { "config.json": "config.json", "preprocessor_config.json": "preprocessor_config.json", "onnx/model_quantized.onnx": "model_quantized.onnx" };
async function modelFile(path, env, ctx) {
  const m = path.match(/^Xenova\/dinov2-small\/resolve\/main\/(.+)$/);
  const asset = m && MODEL_ASSETS[m[1]];
  if (!asset) return new Response("not found", { status: 404 });
  const repo = env.INDEX_REPO || "lenao85/lenao85";
  const res = await cachedAsset(`model/v3/${asset}`, [
    `https://github.com/${repo}/releases/download/model/${asset}`,
    `https://huggingface.co/${path}`,
  ], 2592000, asset.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream", ctx);
  return res || new Response("not found", { status: 502 });
}

// ---------- Identification d'un article (marque, modèle, référence) ----------
// IA gratuite de Cloudflare (Workers AI). On essaie plusieurs modèles d'image dans l'ordre.
const VISION_MODELS = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/google/gemma-3-12b-it",
  "@cf/meta/llama-3.2-11b-vision-instruct",
];

const IDENTIFY_PROMPT = `Tu es un expert en mode, sneakers, streetwear et luxe.
Identifie l'article principal visible sur la photo.
MARQUE : base-toi d'abord sur les LOGOS, étiquettes et détails visibles, pas seulement sur la forme. Beaucoup d'articles se ressemblent, par exemple les doudounes : Moncler (écusson coq tricolore sur la manche ou la poitrine, logo « MONCLER » ; modèles Maya, Montclar, Ecrins…), The North Face (logo demi-dôme brodé sur la poitrine et l'épaule ; Nuptse), Canada Goose (patch rond carte du Canada sur la manche), Stone Island (badge rose des vents sur la manche gauche), Arc'teryx (logo fossile d'oiseau), Ralph Lauren (petit cheval brodé). Si aucun logo n'est lisible, donne la marque la plus probable avec "confiance": "faible".
Des titres d'annonces qui ressemblent visuellement à cette photo sont fournis comme INDICES, classés du plus au moins ressemblant. Ils contiennent souvent le nom du modèle et la référence (code style / SKU, ex : "DV1310-401", "FZ5758-004"), mais beaucoup concernent d'AUTRES coloris du même modèle.
Ne reprends la référence d'un indice que si son coloris correspond aux couleurs visibles sur la photo. Les couleurs sont souvent écrites en chinois : 黑 noir, 白 blanc, 灰 gris, 红 rouge, 蓝 bleu, 黄 jaune, 绿 vert, 粉 rose, 紫 violet, 橙 orange, 棕 marron, 米 beige/crème, 银 argent, 金 or. Les noms de coloris en anglais aussi (Bred = noir/rouge, Dawn, Grape…).
Si plusieurs indices correspondent avec des références différentes, ou si aucun ne correspond clairement, mets "reference": null et "confiance": "moyenne" ou "faible".
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, avec ces clés (valeurs en français, null si inconnu) :
{"marque": "", "modele": "", "coloris": "", "reference": "", "categorie": "", "collab": "", "annee": "", "pays_marque": "", "prix_officiel": "", "confiance": "haute|moyenne|faible", "explication": "1 à 2 phrases : ce qui permet de reconnaître l'article"}
- "reference" = code style / SKU officiel de la marque si tu le connais ou s'il apparaît dans les indices, sinon null. N'invente pas de référence.
- "pays_marque" = pays d'origine de la marque (ex : "États-Unis", "France", "Italie").
- "prix_officiel" = prix de vente officiel approximatif en euros si tu le connais.`;

// Codes style courants (Nike/Jordan : DV1310-401 ; adidas : GY7924)
const REF_RE = /\b(?:[A-Z]{1,3}\d{3,5}-\d{3}|[A-Z]{2}\d{4})\b/g;

function parseJsonLoose(text) {
  if (text && typeof text === "object") return text;
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function runVision(env, model, b64, hints, lang = "fr") {
  const langName = { fr: "français", en: "anglais (English)", es: "espagnol (español)" }[lang] || "français";
  const langRule = lang === "fr" ? "" : `LANGUAGE RULE: write every JSON VALUE (modele, coloris, categorie, pays_marque, explication…) in ${langName}, NOT in French. Keep the JSON keys exactly as given, and keep "confiance" as "haute", "moyenne" or "faible".\n\n`;
  const text = `${langRule}${IDENTIFY_PROMPT}\nIMPORTANT : écris toutes les VALEURS en ${langName} (les clés JSON restent identiques ; "confiance" reste "haute", "moyenne" ou "faible").\n\nINDICES (titres d'albums ressemblants) :\n${hints.length ? hints.map((h) => "- " + h).join("\n") : "(aucun)"}`;
  const input = {
    messages: [
      { role: "user", content: [
        { type: "text", text },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ] },
    ],
    max_tokens: 700,
    temperature: 0.2,
  };
  try {
    return await env.AI.run(model, input);
  } catch (e) {
    // Le modèle Llama 3.2 Vision demande d'accepter sa licence une première fois
    if (/agree/i.test(String(e?.message))) {
      await env.AI.run(model, { prompt: "agree" }).catch(() => {});
      return await env.AI.run(model, input);
    }
    throw e;
  }
}

async function identify(request, env) {
  if (request.method !== "POST") throw new HttpError(405, "POST attendu");
  if (!env.AI) throw new HttpError(501, "IA non configurée sur le serveur");
  const body = await request.json().catch(() => null);
  const b64 = typeof body?.image === "string" ? body.image.replace(/^data:[^,]+,/, "") : "";
  if (!b64 || b64.length > 3_000_000) throw new HttpError(400, "Image manquante ou trop lourde");
  const hints = (Array.isArray(body.hints) ? body.hints : []).slice(0, 10).map((h) => String(h).slice(0, 160));
  const errors = [];
  for (const model of VISION_MODELS) {
    try {
      const out = await runVision(env, model, b64, hints, ["fr", "en", "es"].includes(body.lang) ? body.lang : "fr");
      const data = parseJsonLoose(out?.response ?? out?.result?.response ?? out);
      if (data && (data.marque || data.modele)) {
        // si la référence vient des indices alors que ceux-ci en proposent plusieurs, on ne se dit pas « sûr »
        const refs = new Set(hints.flatMap((h) => h.toUpperCase().match(REF_RE) || []));
        if (data.reference && refs.size > 1 && String(data.confiance).toLowerCase() === "haute") data.confiance = "moyenne";
        return json({ model, ...data });
      }
      errors.push(`${model}: réponse illisible`);
    } catch (e) {
      errors.push(`${model}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  return json({ error: "Impossible d'identifier l'article", details: errors }, 502);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/identify") return await identify(request, env);
      if (url.pathname.startsWith("/api/")) return await api(url.pathname, url.searchParams);
      if (url.pathname === "/img") return await image(url.searchParams, ctx);
      if (url.pathname.startsWith("/index/")) return await indexFile(url.pathname.slice(7), env, ctx);
      if (url.pathname.startsWith("/models/")) return await modelFile(url.pathname.slice(8), env, ctx);
    } catch (e) {
      return json({ error: e.message || "Erreur" }, e.status || 500);
    }
    return env.ASSETS.fetch(request);
  },
};
