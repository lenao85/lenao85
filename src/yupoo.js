// Lecture et analyse des pages Yupoo (aucune API officielle : on lit le HTML).
// Ce module n'utilise que des regex pour tourner aussi bien dans un Worker
// Cloudflare que dans Node (tests).

export const STORE_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

const base = (store) => `https://${store}.x.yupoo.com`;

export const urls = {
  search: (store, q, page = 1) =>
    `${base(store)}/search/album?uid=1&sort=&q=${encodeURIComponent(q)}&page=${page}`,
  albums: (store, page = 1) => `${base(store)}/albums?tab=gallery&page=${page}`,
  album: (store, id) => `${base(store)}/albums/${id}?uid=1`,
};

export function decodeEntities(s = "") {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : null;
};

const clean = (s) => decodeEntities(s || "").replace(/\s+/g, " ").trim();

function photoUrl(u) {
  if (!u) return null;
  if (u.startsWith("//")) u = "https:" + u;
  return /^https:\/\/photo\.yupoo\.com\//.test(u) ? u : null;
}

function firstPhoto(chunk) {
  for (const a of ["data-origin-src", "data-src", "src"]) {
    const re = new RegExp(`\\s${a}="((?:https:)?//photo\\.yupoo\\.com/[^"]+)"`, "i");
    const m = chunk.match(re);
    if (m) return photoUrl(m[1]);
  }
  return null;
}

/** Liste d'albums (page d'accueil "galerie", résultats de recherche, catégories). */
export function parseAlbumList(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b([^>]*class="album3?__main"[^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const inner = m[2];
    const href = attr(tag, "href") || "";
    const idm = href.match(/\/albums\/(\d+)/);
    if (!idm || seen.has(idm[1])) continue;
    seen.add(idm[1]);
    const count = inner.match(/album__photonumber">\s*(\d+)/);
    out.push({
      id: idm[1],
      title: clean(attr(tag, "title") || ""),
      cover: firstPhoto(inner),
      count: count ? +count[1] : null,
    });
  }
  return out;
}

export function parsePageCount(html) {
  const m = html.match(/共\s*(\d+)\s*页/) || html.match(/name="page"[^>]*\smax="(\d+)"/);
  return m ? +m[1] : 1;
}

export function parseStoreName(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!m) return null;
  const parts = clean(m[1]).split("|").map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

// Yupoo emballe certains liens : x.yupoo.com/external?url=<url encodée 2 fois>
export function unwrapExternal(u) {
  const m = u.match(/^https?:\/\/x\.yupoo\.com\/external\?url=([^&]+)/);
  if (!m) return u;
  let v = m[1];
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(v); i++) {
    try { v = decodeURIComponent(v); } catch { break; }
  }
  return /^https?:\/\//.test(v) ? v : u;
}

/** Page d'un album : titre, photos, liens (taobao, weidian…) et description. */
export function parseAlbum(html) {
  const t = html.match(/showalbumheader__gallerytitle[^>]*>([^<]*)/);
  const photos = [];
  const seen = new Set();
  const re = /<div class="image__imagewrap"[^>]*>\s*<img\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const big = photoUrl(attr(tag, "data-src"));
    const orig = photoUrl(attr(tag, "data-origin-src"));
    const full = big || orig;
    if (!full || seen.has(full)) continue;
    seen.add(full);
    photos.push({
      full,
      thumb: big ? big.replace(/\/big\.(\w+)$/, "/medium.$1") : orig,
      w: +attr(tag, "data-width") || null,
      h: +attr(tag, "data-height") || null,
    });
  }
  const links = [];
  let desc = "";
  const sub = html.match(/showalbumheader__gallerysubtitle[^>]*>([\s\S]*?)<\/div>/);
  if (sub) {
    desc = clean(sub[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));
    const lre = /href="(https?:\/\/[^"]+)"/g;
    let l;
    while ((l = lre.exec(sub[1]))) {
      const u = unwrapExternal(decodeEntities(l[1]));
      if (!links.includes(u)) links.push(u);
    }
  }
  return { title: t ? clean(t[1]) : "", photos, links, desc };
}
