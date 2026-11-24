// Construit l'index de la recherche par photo.
// Pour chaque vendeur : liste les albums récents, télécharge la photo de couverture,
// calcule son « empreinte » visuelle (DINOv2) et écrit :
//   out/meta.json  → infos des albums (vendeur, id, titre, couverture)
//   out/vecs.bin   → empreintes (int8, DIM octets par album, même ordre que meta.items)
// Les albums déjà indexés la fois précédente sont réutilisés (seuls les nouveaux sont calculés).
//
// Variables : BASE_URL (adresse de l'appli), MAX_PAGES (pages de 120 albums par vendeur), ONLY (vendeurs séparés par des virgules)

import fs from "node:fs/promises";
import vm from "node:vm";
import { AutoProcessor, AutoModel, RawImage } from "@huggingface/transformers";

const BASE = (process.env.BASE_URL || "https://lenao85.lenaodossantos85.workers.dev").replace(/\/$/, "");
const MAX_PAGES = +(process.env.MAX_PAGES || 15);
const MODEL = "Xenova/dinov2-small"; // doit être le même que dans public/app.js
const DIM = 384;
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = process.env.OUT || ROOT + "out";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function get(url, type = "json", headers = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers });
      if (r.status === 429 && i < 6) { await sleep(2000 * 2 ** i); continue; }
      if (!r.ok) throw new Error(`${r.status}`);
      return type === "json" ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= 3 || /^4\d\d$/.test(e.message)) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

async function loadStores() {
  const ctx = { window: {} };
  vm.runInNewContext(await fs.readFile(ROOT + "public/stores.js", "utf8"), ctx);
  let s = ctx.window.DEFAULT_STORES;
  if (process.env.ONLY) s = process.env.ONLY.split(",").map((x) => x.trim()).filter(Boolean);
  return s;
}

async function loadPrevious() {
  try {
    const meta = await get(`${BASE}/index/meta.json`);
    const vecs = await get(`${BASE}/index/vecs.bin`, "bin");
    if (meta.model !== MODEL || meta.dim !== DIM || vecs.length !== meta.items.length * DIM) throw new Error("format différent");
    const map = new Map();
    meta.items.forEach((it, i) => map.set(`${meta.stores[it[0]]}:${it[1]}`, { it, vec: vecs.subarray(i * DIM, (i + 1) * DIM), store: meta.stores[it[0]] }));
    log(`index précédent : ${map.size} albums`);
    return map;
  } catch (e) {
    log("pas d'index précédent :", e.message);
    return new Map();
  }
}

async function listStore(s) {
  const albums = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const d = await get(`${BASE}/api/albums?s=${s}&p=${p}`);
    albums.push(...d.albums.filter((a) => a.cover));
    if (p >= d.pages) break;
    await sleep(400);
  }
  return albums;
}

const prev = await loadPrevious();
const stores = await loadStores();
log(`${stores.length} vendeurs, ${MAX_PAGES} pages max chacun`);

const proc = await AutoProcessor.from_pretrained(MODEL);
const model = await AutoModel.from_pretrained(MODEL, { dtype: "q8" });

async function embed(buf) {
  const img = await RawImage.fromBlob(new Blob([buf]));
  const out = await model(await proc(img));
  const v = out.last_hidden_state.data.subarray(0, DIM); // jeton CLS
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round((x / n) * 127))));
}

const items = []; // [storeIdx, id, title, coverPath, count]
const vecs = [];
let reused = 0, computed = 0, failed = 0;

for (const [si, s] of stores.entries()) {
  let albums;
  try {
    albums = await listStore(s);
  } catch (e) {
    // vendeur injoignable aujourd'hui : on garde ses albums de la veille
    const old = [...prev.values()].filter((x) => x.store === s);
    for (const o of old) { items.push([si, ...o.it.slice(1)]); vecs.push(o.vec); reused++; }
    log(`${s} : erreur ${e.message}, ${old.length} albums gardés`);
    continue;
  }
  const todo = [];
  for (const a of albums) {
    const cover = a.cover.replace("https://photo.yupoo.com/", "");
    const old = prev.get(`${s}:${a.id}`);
    if (old && old.it[3] === cover) {
      items.push([si, a.id, a.title, cover, a.count]); vecs.push(old.vec); reused++;
    } else todo.push({ a, cover });
  }
  // téléchargements en parallèle (6 à la fois), calcul à la suite
  let k = 0;
  const imgs = new Array(todo.length);
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (k < todo.length) {
      const i = k++;
      const u = todo[i].a.cover;
      // directement chez Yupoo (avec le bon Referer), sinon via le serveur de l'appli
      try { imgs[i] = await get(u, "bin", { referer: `https://${s}.x.yupoo.com/` }); }
      catch { try { imgs[i] = await get(`${BASE}/img?u=${encodeURIComponent(u)}`, "bin"); } catch { imgs[i] = null; } }
    }
  }));
  for (const [i, { a, cover }] of todo.entries()) {
    if (!imgs[i]) { failed++; continue; }
    try {
      vecs.push(await embed(imgs[i]));
      items.push([si, a.id, a.title, cover, a.count]);
      computed++;
    } catch { failed++; }
  }
  log(`${s} : ${albums.length} albums (${todo.length} nouveaux)`);
}

await fs.mkdir(OUT, { recursive: true });
const meta = { model: MODEL, dim: DIM, updated: new Date().toISOString(), stores, items };
await fs.writeFile(`${OUT}/meta.json`, JSON.stringify(meta));
const bin = new Uint8Array(items.length * DIM);
vecs.forEach((v, i) => bin.set(new Uint8Array(v.buffer, v.byteOffset, DIM), i * DIM));
await fs.writeFile(`${OUT}/vecs.bin`, bin);
log(`terminé : ${items.length} albums indexés (${computed} calculés, ${reused} réutilisés, ${failed} échecs)`);
