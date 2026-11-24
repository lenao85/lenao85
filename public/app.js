/* Yupoo Finder — appli (PWA) pour iPhone. Pas de framework, tout est ici. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const img = (u) => (u ? `/img?u=${encodeURIComponent(u)}` : "");
  const yupoo = (s) => `https://${s}.x.yupoo.com`;
  const APP_VERSION = "4.0";

  // ---------- Stockage local ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let stores = store.get("stores", null) || window.DEFAULT_STORES.slice();
  let favs = new Set(store.get("favs", []));
  let status = store.get("status", {}); // vendeur -> "ok" | "bad"
  const saveStores = () => store.set("stores", stores);
  const saveFavs = () => store.set("favs", [...favs]);
  const setStatus = (s, v) => { if (status[s] !== v) { status[s] = v; store.set("status", status); } };
  let snotes = store.get("snotes", {}); // avis perso sur les vendeurs { store: { r, note } }
  let hist = store.get("hist", []); // recherches récentes
  let alerts = store.get("alerts", []); // [{ q, seen: ["store:id"], t }] (+ fresh calculé)
  const saveAlerts = () => store.set("alerts", alerts.map(({ q, seen, t: tt }) => ({ q, seen, t: tt })));
  const alertNewTotal = () => alerts.reduce((n, a) => n + (a.fresh?.length || 0), 0);

  // ---------- Réglages : thème, couleur, langue ----------
  const ACCENTS = {
    aurora: { a: "#6c5ce7", d: "#8b7dff", g: "linear-gradient(135deg,#4f8cff 0%,#8b5cf6 50%,#ec4899 100%)" },
    ocean: { a: "#0a84ff", d: "#409cff", g: "linear-gradient(135deg,#22d3ee 0%,#0a84ff 50%,#6366f1 100%)" },
    mint: { a: "#10b981", d: "#34d399", g: "linear-gradient(135deg,#34d399 0%,#10b981 50%,#0ea5e9 100%)" },
    sunset: { a: "#f2643d", d: "#ff8a5c", g: "linear-gradient(135deg,#f59e0b 0%,#f2643d 50%,#ec4899 100%)" },
    rose: { a: "#e8457c", d: "#ff6b9a", g: "linear-gradient(135deg,#f472b6 0%,#e8457c 50%,#a855f7 100%)" },
  };
  const LANGS = Object.keys(window.I18N);
  const autoLang = () => { const l = (navigator.language || "fr").slice(0, 2); return LANGS.includes(l) ? l : "fr"; };
  let settings = { theme: "auto", accent: "aurora", lang: null, translate: true, est: { fee: 5, perKg: 10, base: 15 }, ...store.get("settings", {}) };
  const lang = () => settings.lang || autoLang();
  const t = (k, vars = {}) => {
    const s = window.I18N[lang()]?.[k] ?? window.I18N.fr[k] ?? k;
    return s.replace(/\{(\w+)\}/g, (_, x) => (vars[x] ?? ""));
  };

  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === "auto") delete root.dataset.theme; else root.dataset.theme = settings.theme;
    const ac = ACCENTS[settings.accent] || ACCENTS.aurora;
    const dark = settings.theme === "dark" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.style.setProperty("--accent", dark ? ac.d : ac.a);
    root.style.setProperty("--grad", ac.g);
    root.lang = lang();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#000000" : "#f4f3fa"));
    renderTabs();
  }
  const saveSettings = () => { store.set("settings", settings); applySettings(); };
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applySettings);

  function normalizeStore(input) {
    let s = String(input || "").trim().toLowerCase();
    const m = s.match(/([a-z0-9][a-z0-9-]*)\.x\.yupoo\.com/);
    if (m) return m[1];
    s = s.replace(/^https?:\/\//, "").replace(/[\/?#].*$/, "");
    return /^[a-z0-9][a-z0-9-]{0,62}$/.test(s) ? s : null;
  }

  // ---------- Utilitaires UI ----------
  const ICON = {
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>`,
    cam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 8.5a2 2 0 0 1 2-2h2.2l1.6-2.2h5.4l1.6 2.2h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.8"/></svg>`,
    grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    chevron: `<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m1 1 6 6-6 6"/></svg>`,
    arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.4 0 5.6 3.3 4.4 6.7C19.5 15.9 12 20.5 12 20.5z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  };
  const field = (attrs) => `<label class="field">${ICON.search}<input ${attrs}></label>`;
  const bigTitle = (title, sub = "") => `<div class="bigtitle"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.hidden = false;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.classList.remove("show"); setTimeout(() => (el.hidden = true), 250); }, 1800);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast(t("linkCopied")); }
    catch { prompt(t("copyThisLink"), text); }
  }

  // ---------- Prix (extraits des titres, convertis en euros) ----------
  let rate = store.get("rate", { v: 0.13, t: 0 });
  function refreshRate() {
    if (Date.now() - rate.t < 12 * 3600e3) return;
    api("rate", {}).then((d) => { rate = { v: d.eurPerCny, usd: d.eurPerUsd, t: Date.now() }; store.set("rate", rate); }).catch(() => {});
  }
  function priceEur(title) {
    const str = String(title || "");
    let m = str.match(/€\s?(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s?(?:€|eur\b)/i);
    if (m) return parseFloat((m[1] || m[2]).replace(",", "."));
    const cny = (v) => (v >= 5 && v <= 30000 ? v * rate.v : null);
    // d'abord « ¥ 255 » / « ￥~598 », puis « 255¥ », « 280CNY », « 170Y »
    if ((m = str.match(/[¥￥]\s?~?\s?(\d{1,5}(?:\.\d{1,2})?)/))) return cny(parseFloat(m[1]));
    if ((m = str.match(/(\d{1,5}(?:\.\d{1,2})?)\s?(?:[¥￥元]|Y(?![a-z])|yuan|rmb|cny)/i))) return cny(parseFloat(m[1]));
    if ((m = str.match(/\$\s?(\d{1,4}(?:\.\d{1,2})?)|(\d{1,4}(?:\.\d{1,2})?)\s?\$|(\d{1,4})\s?usd\b/i))) return parseFloat(m[1] || m[2] || m[3]) * (rate.usd || 0.92);
    if ((m = str.match(/(?:^|\s|【|\[)P(\d{2,4})[A-Z]?(?=\s|\(|（|-|$)/))) return cny(parseFloat(m[1]));
    return null;
  }

  const money = (v) => (v == null ? "" : new Intl.NumberFormat(lang(), { style: "currency", currency: "EUR", maximumFractionDigits: v < 20 ? 1 : 0 }).format(v));

  // ---------- Traduction des mots chinois des titres ----------
  const ZH_KEYS = Object.keys(window.ZH || {}).sort((a, b) => b.length - a.length);
  const ZH_RE = ZH_KEYS.length ? new RegExp(ZH_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  function trTitle(str) {
    str = String(str || "");
    if (!settings.translate || !ZH_RE || !/[一-鿿]/.test(str)) return str;
    const li = { fr: 0, en: 1, es: 2 }[lang()] ?? 0;
    return str.replace(ZH_RE, (w) => " " + window.ZH[w][li] + " ").replace(/\s+/g, " ").trim();
  }

  // ---------- Liste d'envies + panier « à commander » ----------
  let wish = store.get("wish", []); // [{ s, id, title, cover, count, note, cart, opened, cat, t }]
  const cardData = new Map(); // dernières infos d'album affichées (pour ajouter aux envies)
  const isWished = (s, id) => wish.some((w) => w.s === s && w.id === String(id));
  const saveWish = () => { store.set("wish", wish); renderTabs(); };
  const CATS = { shoes: 1.6, jacket: 1.3, hoodie: 0.8, pants: 0.6, tee: 0.3, bag: 1.0, acc: 0.25 };
  const CAT_KEY = { shoes: "catShoes", jacket: "catJacket", hoodie: "catHoodie", pants: "catPants", tee: "catTee", bag: "catBag", acc: "catAcc" };
  function guessCat(title) {
    const x = String(title || "").toLowerCase();
    if (/shoe|sneaker|jordan|\baj ?\d|dunk|yeezy|af1|air force|air max|new balance|\bnb ?\d|boot|slide|trainer|鞋|靴|拖鞋/.test(x)) return "shoes";
    if (/jacket|coat|parka|puffer|down|vest|windbreaker|外套|夹克|羽绒|马甲|风衣|棉服/.test(x)) return "jacket";
    if (/hoodie|sweat|sweater|knit|cardigan|crewneck|卫衣|毛衣|针织|开衫/.test(x)) return "hoodie";
    if (/pant|jean|short|trouser|jogger|裤/.test(x)) return "pants";
    if (/bag|backpack|wallet|tote|包/.test(x)) return "bag";
    if (/\bcap\b|hat|beanie|belt|sock|scarf|ring|necklace|bracelet|watch|glasses|帽|袜|带|链|镜|戒/.test(x)) return "acc";
    return "tee";
  }
  function toggleWish(s, a) {
    if (isWished(s, a.id)) {
      wish = wish.filter((w) => !(w.s === s && w.id === String(a.id)));
      saveWish(); toast(t("removedWish")); return false;
    }
    wish.unshift({ s, id: String(a.id), title: a.title || "", cover: a.cover || "", count: a.count || null, note: "", cart: false, opened: false, cat: guessCat(a.title), t: Date.now() });
    saveWish(); toast(t("addedWish")); return true;
  }
  // cœur sur les cartes : un seul écouteur pour toute l'appli
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wish]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const [s, id] = b.dataset.wish.split("|");
    const on = toggleWish(s, cardData.get(`${s}:${id}`) || { id });
    document.querySelectorAll(`[data-wish="${CSS.escape(b.dataset.wish)}"]`).forEach((x) => { x.classList.toggle("on", on); x.classList.remove("bump"); void x.offsetWidth; x.classList.add("bump"); });
  }, true);

  const sleep = (ms, signal) => new Promise((ok, ko) => {
    const tm = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => { clearTimeout(tm); ko(new DOMException("abort", "AbortError")); });
  });

  // Yupoo freine (erreur 429) si on va trop vite : on attend un peu et on réessaie
  async function api(path, params, signal, timeoutMs = 0) {
    for (let attempt = 0; ; attempt++) {
      let sig = signal, tm;
      if (timeoutMs) {
        // délai max par vendeur : un vendeur lent ne bloque plus toute la recherche
        const c = new AbortController();
        signal?.addEventListener("abort", () => c.abort());
        tm = setTimeout(() => c.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
        sig = c.signal;
      }
      let res;
      try { res = await fetch(`/api/${path}?${new URLSearchParams(params)}`, { signal: sig }); }
      catch (e) { if (signal?.aborted) throw e; if (e.name === "AbortError" || e.name === "TimeoutError") throw new Error("timeout"); throw e; }
      finally { clearTimeout(tm); }
      if (res.status === 429 && attempt < 4) { await sleep(1500 * 2 ** attempt + Math.random() * 1000, signal); continue; }
      const data = await res.json().catch(() => ({ error: "Erreur" }));
      if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`);
      return data;
    }
  }

  function header(title, { back = false, right = "", large = false } = {}) {
    document.body.classList.toggle("large", large);
    $("#title").textContent = title;
    $("#back").hidden = !back;
    $("#backLbl").textContent = t("back");
    $("#topRight").innerHTML = right;
    document.title = title + " · Yupoo Finder";
  }

  function itemCard(a, s, showStore, score, badge) {
    cardData.set(`${s}:${a.id}`, a);
    const pr = priceEur(a.title);
    return `<a class="item" href="#/s/${esc(s)}/a/${esc(a.id)}">
      <div class="im">${a.cover ? `<img loading="lazy" decoding="async" src="${img(a.cover)}" alt="" onload="this.classList.add('ld')">` : ""}
        ${score != null ? `<span class="score">${Math.round(score * 100)}%</span>` : ""}
        ${badge ? `<span class="deal">${esc(badge)}</span>` : ""}
        <button class="heart ${isWished(s, a.id) ? "on" : ""}" data-wish="${esc(s)}|${esc(a.id)}" aria-label="♡">${ICON.heart}</button>
        ${pr != null ? `<span class="price">${esc(money(pr))}</span>` : ""}
        ${a.count ? `<span class="cnt">${a.count} 📷</span>` : ""}</div>
      <div class="tt">${esc(trTitle(a.title) || t("untitled"))}</div>
      ${showStore ? `<div class="st">${esc(s)}</div>` : ""}
    </a>`;
  }
  const skeleton = (n = 6) => `<div class="grid">${Array.from({ length: n }, () => `<div class="item sk"><div class="im"></div><div class="tt"><i></i><i></i></div></div>`).join("")}</div>`;

  // Exécute des tâches en parallèle (limite N à la fois)
  async function pool(items, n, fn) {
    let i = 0;
    const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  }

  let ctrl = null; // annule les requêtes quand on change de page
  const newCtrl = () => { if (ctrl) ctrl.abort(); ctrl = new AbortController(); return ctrl.signal; };

  // ---------- Barre d'onglets ----------
  const TABS = [["stores", "#/", "grid", "tabStores"], ["search", "#/search", "search", "tabSearch"], ["photo", "#/photo", "cam", "tabPhoto"], ["wish", "#/wishlist", "heart", "tabWish"], ["settings", "#/settings", "gear", "tabSettings"]];
  const tabBadge = (id) => (id === "wish" ? wish.filter((w) => w.cart).length : id === "search" ? alertNewTotal() : 0);
  let currentTab = "stores";
  function renderTabs() {
    const nav = $("#tabs");
    nav.innerHTML = `<i class="pill"></i>` + TABS.map(([id, href, ic, key]) => { const n = tabBadge(id); return `<a href="${href}" data-tab="${id}" class="${id === currentTab ? "on" : ""}">${ICON[ic]}<span>${esc(t(key))}</span>${n ? `<b class="tb-badge">${n}</b>` : ""}</a>`; }).join("");
    nav.style.setProperty("--tab", TABS.findIndex(([id]) => id === currentTab));
  }
  function setTab(id) {
    currentTab = id;
    const nav = $("#tabs");
    nav.style.setProperty("--tab", TABS.findIndex(([x]) => x === id));
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === id));
  }

  // ---------- Écran : liste des vendeurs ----------
  // Aperçu (dernières couvertures) gardé 12 h dans le téléphone
  const PV_TTL = 12 * 3600 * 1000;
  const getPreview = (s) => { const p = store.get("pv:" + s, null); return p && Date.now() - p.t < PV_TTL ? p : null; };

  function storeCard(s) {
    const pv = getPreview(s);
    const covers = pv?.covers || [];
    const mosaic = covers.length
      ? `<div class="mosaic">${[0, 1, 2].map((i) => `<i style="background-image:url('${covers[i] ? img(covers[i]) : ""}')"></i>`).join("")}</div>`
      : `<div class="mosaic empty"></div>`;
    const n = pv ? pv.pages * 120 : 0;
    const sub = pv ? (pv.pages > 1 ? t("albumsCount", { n: n > 999 ? Math.round(n / 100) / 10 + " k" : n }) : t("catalog")) : status[s] === "bad" ? t("notFound") : "Yupoo";
    return `<a class="store ${status[s] === "bad" ? "bad" : ""}" href="#/s/${esc(s)}" data-name="${esc(s)}">
      ${mosaic}${favs.has(s) ? `<span class="star">★</span>` : ""}${snotes[s]?.r ? `<span class="rate r-${snotes[s].r}">${{ good: "👍", mid: "😐", bad: "⚠️" }[snotes[s].r]}</span>` : ""}
      <div class="info"><i class="logo"></i><div class="nm">${esc(s)}</div><div class="sub">${sub}</div></div>
    </a>`;
  }

  function viewStores() {
    header(t("tabStores"), { large: true, right: `<button id="editBtn">${esc(t("edit"))}</button>` });
    $("#editBtn").onclick = () => (location.hash = "#/edit");
    const sorted = [...stores].sort((a, b) => a.localeCompare(b));
    const fl = sorted.filter((s) => favs.has(s));
    view.innerHTML = `
      ${bigTitle(t("tabStores"), t("catalogs", { n: stores.length }))}
      <a class="hero" href="#/search">
        <span class="hi">${ICON.search}</span>
        <span><b>${esc(t("searchEverywhere"))}</b><span>${esc(t("searchEverywhereSub"))}</span></span>
        <span class="arrow">${ICON.chevron}</span>
      </a>
      ${alertNewTotal() ? `<a class="news-row" href="#/alerts"><span class="ag-ic">${ICON.bell}</span><span><b>${esc(t("newsTitle"))}</b><small>${alerts.filter((x) => x.fresh?.length).map((x) => `${esc(x.q)} · ${esc(t("newCount", { n: x.fresh.length }))}`).join(" — ")}</small></span>${ICON.chevron}</a>` : ""}
      <a class="agent-row" href="#/agent"><span class="ag-ic">🛒</span><span><b>${esc(t("myAgent"))}</b><small>${agent ? esc(agent.name) + " · " + t(Object.keys(agent.templates || {}).length ? "directOpen" : "linkCopy") : t("notConfigured")}</small></span>${ICON.chevron}</a>
      ${fl.length ? `<div class="section-title">${esc(t("favorites"))}</div>
        <div class="favs">${fl.map((s) => {
          const c = getPreview(s)?.covers?.[0];
          return `<a class="fav" href="#/s/${esc(s)}"><span class="ring"><i ${c ? `style="background-image:url('${img(c)}')"` : ""}></i></span><span>${esc(s)}</span></a>`;
        }).join("")}</div>` : ""}
      <div class="section-title">${esc(t("allStores"))}</div>
      <div class="searchbar">${field(`id="filter" type="search" placeholder="${esc(t("filter"))}" autocomplete="off"`)}</div>
      <div class="stores stagger" id="grid">${sorted.map(storeCard).join("")}</div>
      ${stores.length ? "" : `<div class="empty-state"><div class="big">🛍️</div><b>${esc(t("noStores"))}</b>${esc(t("noStoresSub"))}</div>`}`;
    $("#filter").oninput = (e) => {
      const q = e.target.value.toLowerCase();
      view.querySelectorAll(".store").forEach((el) => (el.hidden = !el.dataset.name.includes(q)));
    };
    // charge les aperçus manquants en arrière-plan
    const missing = stores.filter((s) => !getPreview(s) && status[s] !== "bad");
    if (missing.length) {
      const signal = newCtrl();
      pool(missing, 3, async (s) => {
        try {
          const d = await api("preview", { s }, signal);
          store.set("pv:" + s, { t: Date.now(), covers: d.covers, pages: d.pages });
          setStatus(s, "ok");
        } catch (e) {
          if (e.name === "AbortError") return;
          if (/404/.test(e.message)) setStatus(s, "bad");
        }
        const el = view.querySelector(`.store[data-name="${CSS.escape(s)}"]`);
        if (el && currentRoute === "stores") { const n = document.createElement("div"); n.innerHTML = storeCard(s); n.firstElementChild.hidden = el.hidden; n.firstElementChild.classList.add("pop"); el.replaceWith(n.firstElementChild); }
      });
    }
  }

  // ---------- Écran : albums d'un vendeur ----------
  async function viewStore(s) {
    const fav = favs.has(s);
    header(s, { back: true, large: true, right: `<button id="favBtn" class="ic">${fav ? "★" : "☆"}</button>` });
    $("#favBtn").onclick = () => {
      favs.has(s) ? favs.delete(s) : favs.add(s); saveFavs();
      $("#favBtn").textContent = favs.has(s) ? "★" : "☆";
      $("#favBtn").classList.remove("bump"); void $("#favBtn").offsetWidth; $("#favBtn").classList.add("bump");
      toast(t(favs.has(s) ? "addedFav" : "removedFav"));
    };
    view.innerHTML = `
      ${bigTitle(s, `<a href="${yupoo(s)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(s)}.x.yupoo.com ↗</a>`)}
      <div class="panel snote">
        <div class="snote-h">${esc(t("sellerNote"))}</div>
        <div class="chips wrap" style="margin:8px 0 8px">${["good", "mid", "bad"].map((r) => `<button class="chip ${snotes[s]?.r === r ? "on" : ""}" data-rate="${r}">${esc(t({ good: "rGood", mid: "rMid", bad: "rBad" }[r]))}</button>`).join("")}</div>
        <label class="field"><input id="snoteIn" placeholder="${esc(t("sellerNotePh"))}" value="${esc(snotes[s]?.note || "")}"></label>
      </div>
      <form class="searchbar" id="sf">${field(`id="sq" type="search" placeholder="${esc(t("searchAt", { s }))}" autocomplete="off" enterkeyhint="search"`)}</form>
      <div id="list" class="grid stagger"></div><div id="more"></div>
      <a class="btn ghost block" href="${yupoo(s)}" target="_blank" rel="noopener">${esc(t("openYupoo"))} ↗</a>`;
    view.querySelectorAll("[data-rate]").forEach((b) => (b.onclick = () => {
      const r = snotes[s]?.r === b.dataset.rate ? null : b.dataset.rate;
      snotes[s] = { ...(snotes[s] || {}), r }; store.set("snotes", snotes);
      view.querySelectorAll("[data-rate]").forEach((x) => x.classList.toggle("on", x.dataset.rate === r));
    }));
    $("#snoteIn").onchange = (e) => { snotes[s] = { ...(snotes[s] || {}), note: e.target.value.trim() }; store.set("snotes", snotes); };
    const signal = newCtrl();
    const list = $("#list"), more = $("#more");
    let pageNo = 1, pages = 1, q = "", loading = false;

    async function load(reset) {
      if (loading) return;
      loading = true;
      if (reset) { list.innerHTML = ""; pageNo = 1; }
      more.innerHTML = reset ? skeleton(6) : `<div class="spinner"></div>`;
      try {
        const d = q ? await api("search", { s, q, p: pageNo }, signal) : await api("albums", { s, p: pageNo }, signal);
        setStatus(s, "ok");
        pages = d.pages;
        list.insertAdjacentHTML("beforeend", d.albums.map((a) => itemCard(a, s)).join(""));
        if (!list.children.length) more.innerHTML = `<p class="center muted">${esc(q ? t("noAlbumFor", { q }) : t("noAlbum"))}</p>`;
        else if (pageNo < pages) more.innerHTML = `<button class="btn ghost block" id="mb">${esc(t("seeMore", { p: pageNo + 1, n: pages }))}</button>`;
        else more.innerHTML = "";
        const mb = $("#mb");
        if (mb) mb.onclick = () => { pageNo++; load(false); };
      } catch (e) {
        if (e.name === "AbortError") return;
        if (pageNo === 1 && !q) setStatus(s, "bad");
        more.innerHTML = `<p class="center err">${esc(t("cantLoadStore"))}<br><span class="muted">${esc(e.message)} — ${esc(t("checkName"))}.</span></p>`;
      } finally { loading = false; }
    }
    $("#sf").onsubmit = (e) => { e.preventDefault(); q = $("#sq").value.trim(); $("#sq").blur(); load(true); };
    load(true);
  }

  // ---------- Agent d'achat (Hipobuy, Boonbuy, CNFans…) ----------
  // L'appli ne se connecte pas au compte de l'agent (pas de mot de passe) : elle ouvre la page de l'article
  // chez l'agent dans Safari, où tu es déjà connecté, pour l'ajouter au panier en un geste.
  const AGENTS = [
    { name: "Hipobuy", home: "https://hipobuy.com" },
    { name: "Boonbuy", home: "" },
    { name: "CNFans", home: "https://cnfans.com" },
    { name: "Kakobuy", home: "https://www.kakobuy.com" },
    { name: "Mulebuy", home: "https://mulebuy.com" },
    { name: "Superbuy", home: "https://www.superbuy.com" },
    { name: "AllChinaBuy", home: "https://www.allchinabuy.com" },
    { name: "Sugargoo", home: "https://www.sugargoo.com" },
  ];
  const PLATFORMS = { taobao: "Taobao", weidian: "Weidian", "1688": "1688" };
  const platLabel = (p) => PLATFORMS[p] || t("linkWord");
  let agent = store.get("agent", null); // { name, home, templates: { taobao, weidian, 1688 } }
  const saveAgent = () => store.set("agent", agent);

  function deepDecode(u) {
    let v = String(u || "");
    for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(v); i++) { try { v = decodeURIComponent(v); } catch { break; } }
    return v;
  }

  // Lien Taobao / Weidian / 1688 → { platform, id }
  function parseMarket(u) {
    const v = deepDecode(u);
    let m;
    // liens courts (m.tb.cn, k.youshop10.com…) : pas de numéro d'article lisible, on proposera de copier le lien
    if (/(tb\.cn|youshop|weidian\.com|taobao\.com|tmall\.com|1688\.com)/i.test(v) && !/itemI[dD]=|[?&]id=\d|offer\//.test(v)) return { platform: "lien", id: null };
    if (/weidian\.com/i.test(v) && (m = v.match(/itemI[dD]=(\d{5,})/))) return { platform: "weidian", id: m[1] };
    if (/(taobao|tmall)\.com/i.test(v) && (m = v.match(/[?&]id=(\d{5,})/))) return { platform: "taobao", id: m[1] };
    if (/1688\.com/i.test(v) && (m = v.match(/offer\/(\d{5,})/))) return { platform: "1688", id: m[1] };
    return null;
  }

  // Apprend le format des liens de l'agent à partir d'un exemple : le numéro de l'article devient {id}
  function learnTemplate(example) {
    const raw = String(example || "").trim();
    if (!/^https?:\/\//i.test(raw)) return null;
    const ids = deepDecode(raw).match(/\d{6,}/g);
    if (!ids) return null;
    const id = ids.sort((a, b) => b.length - a.length)[0];
    if (!raw.includes(id)) return null;
    const v = deepDecode(raw).toLowerCase();
    const guess = /weidian|\bwd\b/.test(v) ? "weidian" : /taobao|tmall/.test(v) ? "taobao" : /1688|alibaba/.test(v) ? "1688" : null;
    return { template: raw.split(id).join("{id}"), guess };
  }

  function agentLink(market) {
    if (!market.id) return null;
    const tp = agent?.templates?.[market.platform];
    return tp ? tp.split("{id}").join(market.id) : null;
  }

  function buyPanel(a) {
    const markets = a.links.map((l) => ({ url: l, m: parseMarket(l) })).filter((x) => x.m);
    if (!agent) {
      return `<div class="panel buy"><h2>${esc(t("buyViaAgent"))}</h2>
        <div class="muted">${esc(t("buyViaAgentSub"))}</div>
        <a class="btn grad block" href="#/agent">${esc(t("setupAgent"))}</a></div>`;
    }
    if (!markets.length) {
      return `<div class="panel buy"><h2>${esc(t("buyVia", { a: agent.name }))}</h2><div class="muted">${esc(t("noMarketLink"))}</div></div>`;
    }
    return `<div class="panel buy"><h2>${esc(t("buyVia", { a: agent.name }))}</h2>
      ${markets.map((x, i) => `<button class="btn ${i ? "ghost" : "grad"} block" data-buy="${i}">${esc(t(agentLink(x.m) ? "openAt" : "copyOpen", { a: agent.name }))}<small class="plat">${esc(platLabel(x.m.platform))}</small></button>`).join("")}
      <div class="muted" style="margin-top:8px;font-size:13px">${markets.some((x) => agentLink(x.m))
        ? esc(t("directHint"))
        : `${esc(t("copyHint", { p: platLabel(markets[0].m.platform), a: agent.name }))} <a href="#/agent" style="color:var(--accent)">${esc(t("learnLink"))}</a>${esc(t("learnLinkEnd"))}`}</div>
    </div>`;
  }

  function bindBuy(a) {
    const markets = a.links.map((l) => ({ url: l, m: parseMarket(l) })).filter((x) => x.m);
    view.querySelectorAll("[data-buy]").forEach((b) => (b.onclick = async () => {
      const x = markets[+b.dataset.buy];
      const direct = agentLink(x.m);
      if (direct) { window.open(direct, "_blank", "noopener"); return; }
      try { await navigator.clipboard.writeText(x.url); toast(t("copiedPaste", { a: agent.name })); } catch {}
      if (agent.home) window.open(agent.home, "_blank", "noopener");
    }));
  }

  function viewAgent() {
    header(t("myAgent"), { back: true });
    const cur = agent || { name: "", home: "", templates: {} };
    const tpl = cur.templates || {};
    view.innerHTML = `
      ${bigTitle(t("myAgent"), esc(t("agentSub")))}
      <div class="panel">
        <h2>${esc(t("agentStep1"))}</h2>
        <div class="chips wrap" style="margin:8px 0 0">${AGENTS.map((g) => `<button class="chip ${cur.name === g.name ? "on" : ""}" data-ag="${esc(g.name)}">${esc(g.name)}</button>`).join("")}<button class="chip ${cur.name && !AGENTS.some((g) => g.name === cur.name) ? "on" : ""}" data-ag="">${esc(t("other"))}</button></div>
        <label class="field" style="margin-top:12px"><input id="agName" placeholder="${esc(t("agentName"))}" value="${esc(cur.name)}"></label>
        <label class="field" style="margin-top:8px"><input id="agHome" placeholder="${esc(t("agentHome"))}" value="${esc(cur.home)}" autocapitalize="off"></label>
      </div>
      <div class="panel">
        <h2>${esc(t("agentStep2"))}</h2>
        <div class="muted" style="line-height:1.45">${t("agentStep2Text")}</div>
        ${Object.entries(PLATFORMS).map(([k, label]) => `
          <div class="learn"><div class="learn-h"><b>${esc(t("articleOf", { p: label }))}</b>${tpl[k] ? `<span class="okk">${esc(t("learned"))}</span>` : `<span class="muted">${esc(t("optional"))}</span>`}</div>
          <label class="field"><input data-learn="${k}" placeholder="${esc(t("linkOfArticle", { p: label }))}" autocapitalize="off" autocomplete="off"></label>
          ${tpl[k] ? `<div class="muted tplv">${esc(tpl[k])}</div>` : ""}</div>`).join("")}
      </div>
      <button class="btn block" id="agSave">${esc(t("save"))}</button>
      ${agent ? `<button class="btn ghost block" id="agDel" style="color:var(--err)">${esc(t("removeAgent"))}</button>` : ""}
      <div class="panel" style="margin-top:16px"><h2>${esc(t("privateT"))}</h2><div class="muted" style="line-height:1.45">${esc(t("privateS"))}</div></div>`;
    view.querySelectorAll("[data-ag]").forEach((c) => (c.onclick = () => {
      const g = AGENTS.find((x) => x.name === c.dataset.ag);
      $("#agName").value = g ? g.name : "";
      $("#agHome").value = g ? g.home : "";
      view.querySelectorAll("[data-ag]").forEach((x) => x.classList.toggle("on", x === c));
      if (!g) $("#agName").focus();
    }));
    $("#agSave").onclick = () => {
      const name = $("#agName").value.trim();
      let home = $("#agHome").value.trim();
      if (!name) return toast(t("chooseAgent"));
      if (home && !/^https?:\/\//i.test(home)) home = "https://" + home;
      const templates = { ...(agent?.name === name ? agent.templates : {}) };
      for (const inp of view.querySelectorAll("[data-learn]")) {
        if (!inp.value.trim()) continue;
        const r = learnTemplate(inp.value);
        if (!r) return toast(t("linkNotRecognized", { p: PLATFORMS[inp.dataset.learn] }));
        if (r.guess && r.guess !== inp.dataset.learn && !confirm(t("looksLike", { a: PLATFORMS[r.guess], b: PLATFORMS[inp.dataset.learn] }))) return;
        templates[inp.dataset.learn] = r.template;
        if (!home) { try { home = new URL(inp.value.trim()).origin; } catch {} }
      }
      agent = { name, home, templates };
      saveAgent(); toast(t("agentSaved", { a: name })); viewAgent();
    };
    const del = $("#agDel");
    if (del) del.onclick = () => { if (confirm(t("removeAgentQ"))) { agent = null; store.set("agent", null); viewAgent(); } };
  }

  // ---------- Écran : un album ----------
  async function viewAlbum(s, id) {
    header(s, { back: true, right: `<button id="wishBtn" class="ic heart-top ${isWished(s, id) ? "on" : ""}">${ICON.heart}</button>` });
    view.innerHTML = `<div class="photos sk">${"<i></i>".repeat(9)}</div><div class="panel sk-panel"><i></i><i></i><i></i></div>`;
    const signal = newCtrl();
    try {
      const a = await api("album", { s, id }, signal);
      const cover = cardData.get(`${s}:${id}`)?.cover || a.photos[0]?.thumb || "";
      $("#wishBtn").onclick = () => {
        const on = toggleWish(s, { id, title: a.title, cover, count: a.photos.length });
        $("#wishBtn").classList.toggle("on", on); $("#wishBtn").classList.remove("bump"); void $("#wishBtn").offsetWidth; $("#wishBtn").classList.add("bump");
      };
      const myPrice = priceEur(a.title);
      const firstPhoto = a.photos[0]?.full;
      const lensUrl = firstPhoto ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(location.origin + img(firstPhoto))}` : null;
      view.innerHTML = `
        <div class="photos fade-in">${a.photos.map((p, i) => `<img loading="lazy" src="${img(p.thumb)}" data-i="${i}" alt="" onload="this.classList.add('ld')">`).join("")}</div>
        <div class="panel rise">
          ${myPrice != null ? `<div class="big-price">${esc(money(myPrice))}</div>` : ""}
          <h3>${esc(trTitle(a.title) || "Album")}</h3>
          ${trTitle(a.title) !== a.title ? `<div class="muted orig">${esc(t("original"))} : ${esc(a.title)}</div>` : ""}
          <div class="muted">${esc(t("photos", { n: a.photos.length }))} · <a href="#/s/${esc(s)}" style="color:var(--accent)">${esc(s)}</a></div>
          <div class="row" style="margin-top:14px">
            <a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(t("openYupoo"))}</a>
            <button class="btn ghost" id="cp">${esc(t("copyLink"))}</button>
          </div>
        </div>
        ${buyPanel(a)}
        ${a.links.length ? `<div class="panel links"><h2>${esc(t("buyLinks"))}</h2>${a.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div>` : ""}
        <div class="panel"><h2>${esc(t("sameElsewhere"))}</h2>
          <div class="muted">${esc(t("atOtherStores"))}</div>
          <div id="similar"><button class="btn grad block" id="simBtn">${ICON.cam} ${esc(t("searchByPhoto"))}</button></div>
          <div class="row" style="margin-top:8px">
            <button class="btn small ghost" id="same">${esc(t("byTitle"))}</button>
            ${lensUrl ? `<a class="btn small ghost" href="${esc(lensUrl)}" target="_blank" rel="noopener">Google Lens</a>` : ""}
          </div>
        </div>`;
      $("#simBtn").onclick = () => similarForAlbum(s, id, a.photos[0]?.thumb, $("#similar"), myPrice);
      bindBuy(a);
      $("#cp").onclick = () => copy(a.url);
      $("#same").onclick = () => { location.hash = `#/search?q=${encodeURIComponent(keywords(a.title))}`; };
      view.querySelector(".photos").onclick = (e) => {
        const i = e.target.dataset?.i;
        if (i != null) openLightbox(a.photos.map((p) => p.full), +i);
      };
    } catch (e) {
      if (e.name === "AbortError") return;
      view.innerHTML = `<p class="center err">${esc(t("albumNotFound"))}<br><span class="muted">${esc(e.message)}</span></p>
        <a class="btn ghost block" href="${esc(yupoo(s))}/albums/${esc(id)}?uid=1" target="_blank" rel="noopener">${esc(t("tryOnYupoo"))}</a>`;
    }
  }

  // Garde les mots utiles d'un titre (retire prix, symboles, chinois)
  function keywords(title) {
    return (title || "")
      .replace(/[€¥￥$]\s?[\d.,]+|[\d.,]+\s?[€¥￥$]/g, " ")
      .replace(/[　-鿿＀-￯]+/g, " ")
      .replace(/[#()（）\[\]【】/|*~_+=:;,.!?"'-]+/g, " ")
      .replace(/\b\d{1,3}\b/g, " ")
      .replace(/\s+/g, " ").trim()
      .split(" ").slice(0, 4).join(" ");
  }

  function openLightbox(urls, start) {
    const lb = $("#lightbox"), sc = $("#lbScroll");
    sc.innerHTML = urls.map((u) => `<img loading="lazy" src="${img(u)}" alt="">`).join("");
    lb.hidden = false;
    requestAnimationFrame(() => { lb.classList.add("open"); sc.children[start]?.scrollIntoView(); });
  }
  $("#lbClose").onclick = () => {
    const lb = $("#lightbox");
    lb.classList.remove("open");
    setTimeout(() => { lb.hidden = true; $("#lbScroll").innerHTML = ""; }, 250);
  };

  // ---------- Recherche instantanée (suggestions dès quelques lettres) ----------
  // Construite à partir des ~28 000 titres d'albums de l'index (meta.json, chargé une fois).
  const ALIASES = {
    aj: "air jordan", af1: "air force 1", nb: "new balance", lv: "louis vuitton", cdg: "comme des garcons",
    ch: "chrome hearts", tnf: "the north face", rl: "ralph lauren", ysl: "saint laurent", bape: "bape", ow: "off white",
    sb: "sb dunk", aj1: "jordan 1", aj3: "jordan 3", aj4: "jordan 4", aj5: "jordan 5", aj6: "jordan 6", aj11: "jordan 11",
    yzy: "yeezy", mm: "maison margiela", bb: "balenciaga", gg: "gucci", cp: "cp company", stone: "stone island",
  };
  const STOP = new Set(["batch", "og", "size", "the", "and", "with", "for", "new", "top", "high", "quality", "version", "best", "promotional", "price", "sale", "pcs", "yuan", "free", "shipping", "deal", "eur", "usd"]);
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[€¥￥$]\s?[\d.,]+|[\d.,]+\s?[€¥￥$]/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const sx = { meta: null, loading: null, docs: null, phrases: null, words: null };

  async function loadMeta() {
    if (sx.meta) return sx.meta;
    sx.loading ||= fetch("/index/meta.json").then((r) => { if (!r.ok) throw new Error(t("indexNotReady")); return r.json(); }).then((m) => (sx.meta = m));
    return sx.loading;
  }

  async function buildSearchIndex() {
    if (sx.docs) return;
    const meta = await loadMeta();
    const docs = new Array(meta.items.length);
    const counts = new Map();
    const bump = (p) => counts.set(p, (counts.get(p) || 0) + 1);
    meta.items.forEach((it, i) => {
      const n = norm(it[2]);
      docs[i] = " " + n + " ";
      const w = n.split(" ").filter((x) => x.length > 1 || /\d/.test(x));
      const seen = new Set();
      for (let a = 0; a < w.length; a++) {
        if (/^\d/.test(w[a]) || STOP.has(w[a]) || w[a].length < 2) continue;
        for (let len = 1; len <= 3 && a + len <= w.length; len++) {
          const parts = w.slice(a, a + len);
          if (len > 1 && STOP.has(parts[len - 1])) break;
          const p = parts.join(" ");
          if (!seen.has(p)) { seen.add(p); bump(p); }
        }
      }
    });
    sx.docs = docs;
    // motifs des marques masquées (« N*K* »…) pour les titres qui en ont
    sx.masks = meta.items.map((it) => (/[*⭐🔥✨★☆●•💫]/u.test(it[2]) ? titleWords(it[2]).masks : null));
    sx.keyIndex = new Map(meta.items.map((it, i) => [`${meta.stores[it[0]]}:${it[1]}`, i]));
    sx.phrases = [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
    sx.words = sx.phrases.filter(([p]) => !p.includes(" ")).map(([p]) => p);
  }

  // distance d'édition ≤ 1 (une faute de frappe)
  function near1(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }

  function suggest(qRaw) {
    let q = norm(qRaw);
    if (q.length < 2 || !sx.phrases) return { list: [], fixed: null };
    const toks = q.split(" ");
    const exp = ALIASES[toks[0]];
    const out = [];
    const push = (p) => { if (!out.includes(p) && out.length < 8 && !/\bfuck|\bshit|\bbitch/.test(p)) out.push(p); };
    if (exp && toks.length === 1) push(exp);
    const withAlias = exp ? [exp, ...toks.slice(1)].join(" ") : q;
    for (const qq of new Set([q, withAlias])) {
      for (const [p] of sx.phrases) { if (p.startsWith(qq)) push(p); if (out.length >= 8) break; }
    }
    if (out.length < 8) {
      const last = toks[toks.length - 1], head = toks.slice(0, -1);
      for (const [p] of sx.phrases) {
        const pw = p.split(" ");
        if (pw.some((w) => w.startsWith(last)) && head.every((h) => pw.includes(h))) push(p);
        if (out.length >= 8) break;
      }
    }
    let fixed = null;
    if (out.length < 3) {
      // correction de fautes : remplace les mots inconnus par le mot le plus fréquent à 1 lettre près
      const fixedToks = toks.map((w) => (w.length >= 4 && !sx.words.some((x) => x.startsWith(w)) ? sx.words.find((x) => near1(w, x)) || w : w));
      const f = fixedToks.join(" ");
      if (f !== q) {
        for (const [p] of sx.phrases) { if (p.startsWith(f)) push(p); if (out.length >= 8) break; }
        fixed = out.find((p) => p.startsWith(f)) || f;
        if (!out.some((p) => p.startsWith(f))) out.unshift(f);
      }
    }
    return { list: out.slice(0, 8), fixed };
  }

  // Albums de l'index dont le titre contient tous les mots tapés (le dernier en début de mot)
  function instantResults(qRaw, limit = 24, fixed = null) {
    const q = norm(qRaw);
    if (q.length < 2 || !sx.docs) return { total: 0, list: [] };
    const base = q.split(" ");
    const variants = [base];
    if (ALIASES[base[0]]) variants.push([...ALIASES[base[0]].split(" "), ...base.slice(1)]);
    if (fixed) variants.push(fixed.split(" "));
    const meta = sx.meta;
    const hits = [];
    for (let i = 0; i < sx.docs.length; i++) {
      const d = sx.docs[i];
      let best = -1;
      for (const toks of variants) {
        let ok = true, exact = 0;
        for (let k = 0; k < toks.length; k++) {
          const tk = toks[k];
          if (d.includes(" " + tk + " ")) { exact++; continue; }
          if (k === toks.length - 1 && d.includes(" " + tk)) continue;
          if (tk.length >= 3 && sx.masks[i]?.some((re) => re.test(tk))) { exact++; continue; }
          ok = false; break;
        }
        if (ok && exact > best) best = exact;
      }
      if (best >= 0) hits.push([i, best]);
    }
    const fav = (i) => (favs.has(meta.stores[meta.items[i][0]]) ? 1 : 0);
    hits.sort((a, b) => b[1] - a[1] || fav(b[0]) - fav(a[0]));
    // varie les vendeurs : pas plus de 4 albums du même vendeur dans le haut de liste
    const per = {}, list = [];
    for (const [i] of hits) {
      const it = meta.items[i], s = meta.stores[it[0]];
      if ((per[s] = (per[s] || 0) + 1) > 4) continue;
      list.push({ s, a: { id: it[1], title: it[2], cover: "https://photo.yupoo.com/" + it[3], count: it[4] } });
      if (list.length >= limit) break;
    }
    return { total: hits.length, list };
  }

  // ---------- Écran : recherche sur tous les vendeurs ----------
  let lastSearch = { q: "", results: [], errors: [], done: 0, filter: null, extra: [], extraState: "" };

  function viewSearch(q0) {
    header(t("searchTitle"), { large: true });
    view.innerHTML = `
      ${bigTitle(t("searchTitle"), esc(t("searchSub", { n: stores.length })))}
      <form class="searchbar sticky" id="f">
        ${field(`id="q" type="search" placeholder="${esc(t("searchPh"))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${esc(q0 || lastSearch.q)}"`)}
      </form>
      <div id="sugg"></div>
      <div id="out"></div>`;
    const input = $("#q");
    buildSearchIndex().then(() => { if (input === $("#q") && document.activeElement === input && input.value) onType(); }).catch(() => {});
    let typed = false;
    const onType = () => {
      typed = true;
      const v = input.value;
      if (norm(v).length < 2) { $("#sugg").innerHTML = ""; if (!lastSearch.q) showSearchEmpty(); return; }
      renderInstant(v);
    };
    let deb;
    input.oninput = () => { clearTimeout(deb); deb = setTimeout(onType, 90); };
    input.onfocus = () => { if (input.value && typed) onType(); };
    $("#f").onsubmit = (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      startLive(q);
    };
    if (q0 && q0 !== lastSearch.q) startLive(q0);
    else if (lastSearch.q) renderResults();
    else showSearchEmpty();
    if (!q0 && !lastSearch.q) setTimeout(() => input.focus({ preventScroll: true }), 350);
  }

  function showSearchEmpty() {
    $("#out").innerHTML = `${hist.length ? `<div class="section-title">${esc(t("recent"))} <button class="link-btn" id="histClear">${esc(t("clear"))}</button></div>
      <div class="chips wrap">${hist.map((h) => `<a class="chip hist" href="#/search?q=${encodeURIComponent(h)}">🕘 ${esc(h)}</a>`).join("")}</div>` : ""}
      <div class="empty-state fade-in"><div class="big">🔎</div><b>${esc(t("searchEmptyT"))}</b>${esc(t("searchEmptyS"))}</div>
      <div class="chips wrap center-chips">${["jordan 4", "hoodie", "air force 1", "stussy", "chrome hearts", "jersey"].map((w) => `<a class="chip" href="#/search?q=${encodeURIComponent(w)}">${w}</a>`).join("")}</div>`;
    const hc = $("#histClear");
    if (hc) hc.onclick = () => { hist = []; store.set("hist", hist); showSearchEmpty(); };
  }

  function startLive(q) {
    $("#q").value = q;
    $("#q").blur();
    $("#sugg").innerHTML = "";
    history.replaceState(null, "", `#/search?q=${encodeURIComponent(q)}`);
    hist = [q, ...hist.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 12); store.set("hist", hist);
    runSearch(q);
  }

  function hl(p, q) {
    const i = p.indexOf(q);
    return i < 0 ? esc(p) : `${esc(p.slice(0, i))}<b>${esc(p.slice(i, i + q.length))}</b>${esc(p.slice(i + q.length))}`;
  }

  function renderInstant(v) {
    const sug = $("#sugg");
    if (!sx.docs) { sug.innerHTML = `<div class="sugg-box"><div class="spinner small"></div></div>`; return; }
    const q = norm(v);
    const { list, fixed } = suggest(v);
    const inst = instantResults(v, 24, fixed);
    sug.innerHTML = `
      ${list.length ? `<div class="sugg-box pop-in">
        ${fixed ? `<div class="sugg-fix">${esc(t("didYouMean"))} <b>${esc(fixed)}</b> ?</div>` : ""}
        ${list.map((p) => `<button class="sugg" data-s="${esc(p)}">${ICON.search}<span>${hl(p, q)}</span><i class="go">${ICON.arrowUp}</i></button>`).join("")}
      </div>` : ""}
      <button class="live-btn" data-live="${esc(v.trim())}">${ICON.search}<span>${esc(t("liveSearch", { q: v.trim() }))}</span></button>
      ${inst.list.length ? `<div class="section-title" style="margin-top:18px">${esc(t("instant"))} <small>${esc(t("instantSub", { n: inst.total }))}</small></div>
        <div class="grid">${inst.list.map((r) => itemCard(r.a, r.s, true)).join("")}</div>` : ""}`;
    $("#out").innerHTML = "";
    sug.querySelectorAll(".sugg").forEach((b) => (b.onclick = () => startLive(b.dataset.s)));
    sug.querySelectorAll(".sugg .go").forEach((g) => (g.onclick = (e) => {
      e.stopPropagation();
      const inp = $("#q"); inp.value = g.closest(".sugg").dataset.s + " "; inp.focus(); renderInstant(inp.value);
    }));
    const lb = sug.querySelector(".live-btn");
    if (lb) lb.onclick = () => startLive(lb.dataset.live);
  }

  const LIVE_TTL = 30 * 60 * 1000;
  async function runSearch(q) {
    const signal = newCtrl();
    const ck = "ls:" + q.toLowerCase();
    try {
      const c = JSON.parse(sessionStorage.getItem(ck) || "null");
      if (c && Date.now() - c.t < LIVE_TTL && c.n === stores.length) {
        lastSearch = { ...c.data, q, filter: null, sort: "rel", cached: true };
        renderResults();
        return;
      }
    } catch {}
    lastSearch = { q, results: [], errors: [], done: 0, filter: null, extra: [], extraState: "loading", sort: "rel" };
    renderResults();
    const discovering = discoverOthers(q, signal); // en parallèle : autres vendeurs Yupoo
    const order = [...stores].sort((a, b) => favs.has(b) - favs.has(a)); // favoris d'abord
    await pool(order, 6, async (s) => {
      if (signal.aborted) return;
      try {
        const d = await api("search", { s, q }, signal, 12000);
        setStatus(s, "ok");
        if (d.albums.length) lastSearch.results.push({ s, albums: d.albums, pages: d.pages });
      } catch (e) {
        if (e.name === "AbortError") return;
        lastSearch.errors.push(s);
      }
      lastSearch.done++;
      if (lastSearch.q === q && !signal.aborted) scheduleRender();
    });
    await discovering;
    if (!signal.aborted && lastSearch.q === q) {
      try { const { results, errors, done, extra, extraState } = lastSearch; sessionStorage.setItem(ck, JSON.stringify({ t: Date.now(), n: stores.length, data: { results, errors, done, extra, extraState } })); } catch {}
    }
  }

  // Vendeurs Yupoo qui ne sont pas dans ta liste, trouvés via un moteur de recherche
  async function discoverOthers(q, signal) {
    try {
      const d = await api("discover", { q }, signal);
      const others = d.stores.filter((x) => !stores.includes(x.store)).slice(0, 10);
      await pool(others, 3, async (o) => {
        try {
          const r = await api("search", { s: o.store, q }, signal);
          if (r.albums.length) lastSearch.extra.push({ s: o.store, albums: r.albums, pages: r.pages });
        } catch (e) { if (e.name === "AbortError") throw e; }
        if (lastSearch.q === q && !signal.aborted) scheduleRender();
      });
      lastSearch.extraState = "done";
    } catch (e) {
      if (e.name === "AbortError") return;
      lastSearch.extraState = "error";
    }
    if (lastSearch.q === q && !signal.aborted) renderResults();
  }

  // ---------- Pertinence : tous les mots tapés doivent être dans le titre ----------
  // Les vendeurs masquent souvent les marques (« N*K* », « B⭐L⭐⭐IA⭐A ») : ces mots deviennent des motifs.
  const OBF = new Set(["*", "⭐", "🔥", "✨", "❤", "♥", "★", "☆", "✪", "●", "•", "_", "💫", "#"]);
  const twCache = new Map();
  function titleWords(title) {
    let tw = twCache.get(title);
    if (tw) return tw;
    const raw = String(title || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ️]/g, "");
    const masks = [];
    for (const w of raw.split(/[\s,.;:!?()（）\[\]【】|\/~+="'-]+/)) {
      if (![...w].some((c) => OBF.has(c)) || !/[a-z]/.test(w)) continue;
      let re = "";
      for (const c of w) re += OBF.has(c) ? ".{0,3}" : /[a-z0-9]/.test(c) ? c : "";
      if (re.replace(/\.\{0,3\}/g, "").length >= 1) masks.push(new RegExp("^" + re + "$"));
    }
    tw = { text: " " + norm(raw) + " ", masks };
    if (twCache.size > 20000) twCache.clear();
    twCache.set(title, tw);
    return tw;
  }
  function queryVariants(q) {
    const base = norm(q).split(" ").filter(Boolean);
    const v = [base];
    if (ALIASES[base[0]]) v.push([...ALIASES[base[0]].split(" "), ...base.slice(1)]);
    return v;
  }
  // part des mots de la recherche présents dans le titre (1 = tous)
  function relevance(title, variants) {
    const tw = titleWords(title);
    let best = 0;
    for (const toks of variants) {
      let hit = 0;
      for (const tk of toks) if (tw.text.includes(" " + tk) || (tk.length >= 3 && tw.masks.some((re) => re.test(tk)))) hit++;
      best = Math.max(best, toks.length ? hit / toks.length : 0);
    }
    return best;
  }

  // pendant la recherche, on redessine au plus toutes les 400 ms (défilement plus fluide)
  let rrTimer = null, rrLast = 0;
  function scheduleRender() {
    const wait = Math.max(0, 400 - (Date.now() - rrLast));
    if (rrTimer) return;
    rrTimer = setTimeout(() => { rrTimer = null; rrLast = Date.now(); renderResults(); }, wait);
  }

  function renderResults() {
    const out = $("#out");
    if (!out) return;
    const { results, errors, done, filter } = lastSearch;
    const finished = done >= stores.length;
    const variants = queryVariants(lastSearch.q);
    // mélange : 1 album de chaque vendeur à tour de rôle, pour ne pas tout avoir du même
    let all = [];
    for (let i = 0; results.some((r) => i < r.albums.length); i++) results.forEach((r) => r.albums[i] && all.push([r.albums[i], r.s, relevance(r.albums[i].title, variants)]));
    const exactAll = all.filter((x) => x[2] >= 1);
    const total = exactAll.length;
    const perStore = {};
    exactAll.forEach((x) => (perStore[x[1]] = (perStore[x[1]] || 0) + 1));
    const storesExact = Object.keys(perStore);
    let mixed = exactAll.filter((x) => !filter || x[1] === filter);
    const near = all.filter((x) => x[2] < 1 && x[2] >= 0.5 && (!filter || x[1] === filter)).sort((a, b) => b[2] - a[2]);
    const sort = lastSearch.sort || "rel";
    if (sort !== "rel") {
      const pv = (x) => priceEur(x[0].title);
      mixed = mixed.filter((x) => pv(x) != null).sort((a, b) => (sort === "asc" ? pv(a) - pv(b) : pv(b) - pv(a))).concat(mixed.filter((x) => pv(x) == null));
    }
    const hasAlert = alerts.some((a) => a.q.toLowerCase() === lastSearch.q.toLowerCase());
    out.innerHTML = `
      ${finished ? "" : `<div class="progress"><i style="width:${(done / stores.length) * 100}%"></i></div>`}
      <p class="muted" style="margin:0 4px 10px">${finished ? "" : esc(t("searching", { d: done, n: stores.length }))}${t("albumsAt", { t: total, n: storesExact.length })}
        ${finished && errors.length ? `<br><span class="err">${esc(t("noReply", { n: errors.length }))}</span>` : ""}${lastSearch.cached ? ` · <span>${esc(t("cached"))}</span>` : ""}</p>
      <div class="tools-row">
        <div class="seg mini" style="--n:3;--i:${["rel", "asc", "desc"].indexOf(sort)}"><i class="seg-pill"></i>${[["rel", "sortRel"], ["asc", "sortAsc"], ["desc", "sortDesc"]].map(([k, l]) => `<button class="seg-b ${sort === k ? "on" : ""}" data-sort="${k}">${esc(t(l))}</button>`).join("")}</div>
        <button class="alert-btn ${hasAlert ? "on" : ""}" id="alertBtn" ${hasAlert ? "disabled" : ""}>${ICON.bell}<span>${esc(t(hasAlert ? "alertOn" : "alertBtn").replace("🔔 ", ""))}</span></button>
      </div>
      ${storesExact.length > 1 ? `<div class="chips">
        <button class="chip ${filter ? "" : "on"}" data-f="">${esc(t("all"))}</button>
        ${storesExact.sort((a, b) => perStore[b] - perStore[a]).map((st) => `<button class="chip ${filter === st ? "on" : ""}" data-f="${esc(st)}">${esc(st)} · ${perStore[st]}</button>`).join("")}
      </div>` : ""}
      ${!total && !finished ? skeleton(4) : ""}
      <div class="grid">${mixed.map(([a, s]) => itemCard(a, s, true)).join("")}</div>
      ${finished && near.length ? (lastSearch.showNear
        ? `<div class="section-title" style="margin-top:22px">${esc(t("nearTitle"))} <small>${esc(t("nearSub"))}</small></div><div class="grid">${near.slice(0, 60).map(([a, s]) => itemCard(a, s, true)).join("")}</div>`
        : `<button class="btn ghost block" id="nearBtn">${esc(t("nearMatches", { n: near.length }))}</button>`) : ""}
      ${filter && results.find((r) => r.s === filter)?.pages > 1 ? `<a class="btn ghost block" href="#/s/${esc(filter)}">${esc(t("moreAt", { s: filter }))}</a>` : ""}
      ${finished && !total ? `<div class="empty-state"><div class="big">🤷</div><b>${esc(t("nothingT"))}</b>${esc(t("nothingS"))}</div>` : ""}
      ${filter ? "" : renderExtra()}`;
    out.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { lastSearch.filter = c.dataset.f || null; renderResults(); }));
    out.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { lastSearch.sort = b.dataset.sort; renderResults(); }));
    const nb = $("#nearBtn");
    if (nb) nb.onclick = () => { lastSearch.showNear = true; renderResults(); };
    const ab = $("#alertBtn");
    if (ab && !hasAlert) ab.onclick = () => addAlert(lastSearch.q);
    out.querySelectorAll("[data-addstore]").forEach((b) => (b.onclick = (e) => {
      e.preventDefault();
      const st = b.dataset.addstore;
      if (!stores.includes(st)) { stores.push(st); saveStores(); }
      b.textContent = t("added"); b.disabled = true;
      toast(t("addedStore", { s: st }));
    }));
  }

  function renderExtra() {
    const variants = queryVariants(lastSearch.q);
    const extra = lastSearch.extra.map((r) => ({ ...r, albums: r.albums.filter((a) => relevance(a.title, variants) >= 1) })).filter((r) => r.albums.length);
    const { extraState } = lastSearch;
    if (!extra.length && extraState !== "loading") return "";
    return `<div class="section-title" style="margin-top:26px">${esc(t("others"))} <small>${esc(t("othersSub"))}</small></div>
      ${extra.map((r) => `<div class="other">
        <div class="other-head"><i class="lg"></i><a href="#/s/${esc(r.s)}"><b>${esc(r.s)}</b><small>${esc(t("albumsFound", { n: r.albums.length + (r.pages > 1 ? "+" : "") }))}</small></a>
          ${stores.includes(r.s) ? `<span class="muted">${esc(t("inList"))}</span>` : `<button class="btn small ghost" data-addstore="${esc(r.s)}">${esc(t("add"))}</button>`}</div>
        <div class="hscroll">${r.albums.slice(0, 8).map((a) => itemCard(a, r.s)).join("")}</div>
      </div>`).join("")}
      ${extraState === "loading" ? `<div class="spinner"></div><p class="center muted" style="padding-top:0">${esc(t("findingOthers"))}</p>` : ""}`;
  }

  // ---------- Recherche visuelle (dans l'iPhone) ----------
  // Le modèle DINOv2 calcule une « empreinte » de la photo ; on la compare aux empreintes
  // des couvertures d'albums de tous les vendeurs (index construit chaque nuit par GitHub).
  const VIS = { lib: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2", model: "Xenova/dinov2-small", dim: 384 };
  const ps = { T: null, proc: null, model: null, index: null };

  async function loadModel(onStatus) {
    if (ps.model) return;
    onStatus(t("loadingModel"));
    const T = await import(VIS.lib);
    T.env.allowLocalModels = false;
    T.env.remoteHost = location.origin + "/models/"; // modèle relayé par notre serveur
    ps.proc = await T.AutoProcessor.from_pretrained(VIS.model);
    // WebAssembly SIMD (la plupart des iPhone), sinon la carte graphique (WebGPU) ; sinon recherche par texte
    const devices = [];
    if (wasmSimdOk()) devices.push("wasm");
    if (navigator.gpu) devices.push("webgpu");
    for (const device of devices) {
      try { ps.model = await T.AutoModel.from_pretrained(VIS.model, { dtype: "q8", device }); ps.device = device; break; } catch (e) { ps.loadErr = e; }
    }
    if (!ps.model) { const err = new Error(t("noVisual")); err.noVisual = true; throw err; }
    ps.T = T;
  }
  function wasmSimdOk() {
    try {
      return typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch { return false; }
  }

  async function loadIndex(onStatus) {
    if (ps.index) return ps.index;
    onStatus(t("loadingIndex"));
    const [meta, vr] = await Promise.all([loadMeta(), fetch("/index/vecs.bin")]);
    if (!vr.ok) throw new Error(t("indexNotReady"));
    const vecs = new Int8Array(await vr.arrayBuffer());
    if (meta.model !== VIS.model || meta.dim !== VIS.dim) throw new Error(t("indexOld"));
    const byKey = new Map(meta.items.map((it, i) => [`${meta.stores[it[0]]}:${it[1]}`, i]));
    ps.index = { meta, vecs, byKey };
    return ps.index;
  }

  async function embedBlob(blob) {
    const im = await ps.T.RawImage.fromBlob(blob);
    const out = await ps.model(await ps.proc(im));
    const v = Float32Array.from(out.last_hidden_state.data.subarray(0, VIS.dim));
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return v.map((x) => x / n);
  }

  // Renvoie les meilleurs albums : [{ s, a, score }]
  function nearest(q, { exclude = null, excludeStore = null, limit = 60, perStore = 12 } = {}) {
    const { meta, vecs } = ps.index;
    const D = VIS.dim, N = meta.items.length;
    const scores = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let d = 0;
      const o = i * D;
      for (let j = 0; j < D; j++) d += q[j] * vecs[o + j];
      scores[i] = d / 127;
    }
    const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
    const out = [], count = {};
    for (const i of order) {
      if (out.length >= limit) break;
      const it = meta.items[i];
      const s = meta.stores[it[0]];
      if (`${s}:${it[1]}` === exclude || s === excludeStore) continue;
      if ((count[s] = (count[s] || 0) + 1) > perStore) continue;
      out.push({ s, score: scores[i], a: { id: it[1], title: it[2], cover: "https://photo.yupoo.com/" + it[3], count: it[4] } });
    }
    return out;
  }

  function renderMatches(el, res, refPrice = null) {
    const n = new Set(res.map((r) => r.s)).size;
    // « Moins cher » : le moins cher parmi les très ressemblants (score ≥ 0,8)
    const close = res.filter((r) => r.score >= 0.8 && priceEur(r.a.title) != null);
    const cheapest = close.length ? close.reduce((m, r) => (priceEur(r.a.title) < priceEur(m.a.title) ? r : m)) : null;
    el.innerHTML = `<p class="muted">${esc(t("similarCount", { n: res.length, s: n }))}</p>
      <div class="grid stagger">${res.map((r) => {
        const p = priceEur(r.a.title);
        let badge = null;
        if (r === cheapest) badge = t("cheapest");
        else if (refPrice != null && p != null && r.score >= 0.8 && refPrice - p >= 1) badge = t("cheaperBy", { p: money(refPrice - p) });
        return itemCard(r.a, r.s, true, r.score, badge);
      }).join("")}</div>`;
  }

  const statusHtml = (msg) => `<div class="spinner"></div><p class="center muted" style="padding-top:0">${esc(msg)}</p>`;

  async function similarForAlbum(s, id, thumb, el, refPrice = null) {
    const st = (m) => (el.innerHTML = statusHtml(m));
    try {
      await loadIndex(st);
      const i = ps.index.byKey.get(`${s}:${id}`);
      let q;
      if (i != null) {
        q = Float32Array.from(ps.index.vecs.subarray(i * VIS.dim, (i + 1) * VIS.dim), (x) => x / 127);
      } else {
        if (!thumb) throw new Error(t("noPhotoAlbum"));
        await loadModel(st);
        st(t("analysing"));
        q = await embedBlob(await (await fetch(img(thumb))).blob());
      }
      renderMatches(el, nearest(q, { excludeStore: s, limit: 30, perStore: 4 }), refPrice);
    } catch (e) {
      el.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }

  // ---------- Écran : recherche par photo ----------
  function viewPhoto() {
    header(t("photoTitle"), { large: true });
    view.innerHTML = `
      ${bigTitle(t("photoTitle"), esc(t("photoSub")))}
      <form id="lensForm" method="post" enctype="multipart/form-data" action="https://lens.google.com/v3/upload?hl=${lang()}" target="_blank">
        <label class="drop" id="drop">
          <input type="file" name="encoded_image" id="file" accept="image/*" hidden>
          <div id="prev"><div class="cam">${ICON.cam}</div><b>${esc(t("pickPhoto"))}</b><div class="muted">${esc(t("pickPhotoSub"))}</div></div>
        </label>
        <div id="ident"></div>
        <div id="results"></div>
        <div id="actions" hidden>
          <div class="panel" style="margin-top:14px">
            <h2>${esc(t("notFoundWeb"))}</h2>
            <button class="btn ghost block" type="submit">Google Lens</button>
            <button class="btn ghost block" type="button" id="bing">Bing</button>
            <div class="muted" style="margin-top:8px">${t("lensTip")}</div>
          </div>
        </div>
      </form>
      <div class="panel" id="howto" style="margin-top:16px">
        <h2>${esc(t("howTitle"))}</h2>
        <div class="muted" style="line-height:1.45">${t("howText")}</div>
      </div>`;
    const file = $("#file");
    file.onchange = () => {
      const f0 = file.files[0];
      if (!f0) return;
      $("#howto").hidden = true;
      $("#ident").innerHTML = ""; $("#results").innerHTML = "";
      cropper(f0, (f, url) => runPhotoSearch(f, url));
    };
    const runPhotoSearch = async (f, url) => {
      let visualFailed = false;
      $("#prev").innerHTML = `<img src="${url}" alt="" class="pop"><div class="muted" style="margin-top:8px">${esc(t("changePhoto"))}</div>`;
      $("#drop").classList.add("has");
      $("#actions").hidden = false;
      $("#howto").hidden = true;
      const el = $("#results");
      const st = (m) => (el.innerHTML = statusHtml(m));
      $("#ident").innerHTML = "";
      let matches = [];
      try {
        await Promise.all([loadModel(st), loadIndex(() => {})]);
        st(t("analysing"));
        const q = await embedBlob(f);
        st(t("comparing"));
        await new Promise((r) => setTimeout(r, 30));
        matches = nearest(q);
        renderMatches(el, matches);
      } catch (e) {
        visualFailed = true;
        el.innerHTML = `<p class="muted" style="margin-top:12px">${esc(e.noVisual || /SIMD|backend|WebAssembly|wasm/i.test(e.message) ? t("noVisualHelp") : e.message)}</p>`;
      }
      // identification par IA (marque, modèle, référence), aidée par les titres des albums ressemblants
      const d = await identifyPhoto(f, matches, $("#ident"));
      // si la recherche visuelle n'a pas marché : résultats par texte à partir de l'identification
      if (visualFailed && d && (d.marque || d.modele)) {
        try {
          await buildSearchIndex();
          // marque + modèle sans répéter les mots (« Air Jordan » + « Air Jordan 5 » → « Air Jordan 5 »)
          const words = [];
          for (const w of [d.marque, d.modele].filter(Boolean).join(" ").split(/\s+/)) if (!words.some((x) => x.toLowerCase() === w.toLowerCase())) words.push(w);
          let q = words.join(" ");
          let inst = instantResults(q, 40);
          if (!inst.total && d.marque) { q = d.marque; inst = instantResults(q, 40); }
          el.innerHTML += `<div class="section-title" style="margin-top:14px">${esc(t("textFallback", { q }))} <small>${esc(t("instantSub", { n: inst.total }))}</small></div>
            ${inst.list.length ? `<div class="grid stagger">${inst.list.map((r) => itemCard(r.a, r.s, true)).join("")}</div>` : ""}
            <a class="btn grad block" href="#/search?q=${encodeURIComponent(q)}">${esc(t("liveSearch", { q }))}</a>`;
        } catch {}
      }
    };
    $("#bing").onclick = async () => {
      const f = file.files[0];
      if (!f) return;
      const b64 = await toJpegBase64(f, 1200);
      const form = document.createElement("form");
      form.method = "post"; form.target = "_blank"; form.enctype = "multipart/form-data";
      form.action = "https://www.bing.com/images/search?view=detailv2&iss=sbiupload&FORM=SBIIDP";
      const inp = document.createElement("input");
      inp.type = "hidden"; inp.name = "imageBin"; inp.value = b64;
      form.appendChild(inp); document.body.appendChild(form); form.submit(); form.remove();
    };
  }

  // Références (codes style) présentes dans les titres des albums ressemblants
  const REF_RE = /\b(?:[A-Z]{1,3}\d{3,5}-\d{3}|[A-Z]{2}\d{4})\b/g;
  function refCandidates(matches) {
    const seen = new Map();
    for (const m of matches.slice(0, 30)) {
      for (const r of (m.a.title || "").toUpperCase().match(REF_RE) || []) {
        if (!seen.has(r)) seen.set(r, m);
      }
    }
    return [...seen].slice(0, 6);
  }

  async function identifyPhoto(file, matches, el) {
    const hints = matches.slice(0, 8).map((m) => m.a.title);
    const cands = refCandidates(matches);
    el.innerHTML = `<div class="panel ident">${statusHtml(t("identifying"))}</div>`;
    try {
      const image = await toJpegBase64(file, 768);
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image, hints, lang: lang() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) throw new Error(d.error || t("serviceDown"));
      const ref = d.reference;
      const name = [d.marque, d.modele].filter(Boolean).join(" ");
      const facts = [
        ["fRef", ref], ["fColor", d.coloris], ["fCat", d.categorie], ["fCollab", d.collab],
        ["fYear", d.annee], ["fOrigin", d.pays_marque], ["fPrice", d.prix_officiel],
      ].filter(([, v]) => v && String(v).toLowerCase() !== "null");
      const conf = { haute: ["confHigh", "ok"], moyenne: ["confMid", "mid"], faible: ["confLow", "low"] }[String(d.confiance).toLowerCase()] || ["confEst", "mid"];
      const q = ref || name;
      el.innerHTML = `<div class="panel ident rise">
        <div class="ident-top"><span class="ai">${esc(t("identifiedAI"))}</span><span class="conf ${conf[1]}">${esc(t(conf[0]))}</span></div>
        ${d.marque ? `<div class="brand">${esc(d.marque)}</div>` : ""}
        <h3>${esc(d.modele || name || t("article"))}</h3>
        <div class="facts">${facts.map(([k, v]) => `<div class="fact"${k === "fRef" ? ` id="refCopy"` : ""}><span>${esc(t(k))}</span><b>${esc(v)}${k === "fRef" ? " ⧉" : ""}</b></div>`).join("")}</div>
        ${d.explication ? `<p class="muted" style="margin:10px 0 0">${esc(d.explication)}</p>` : ""}
        ${cands.length ? `<div class="cands"><div class="muted" style="margin:14px 0 6px">${esc(t("refsSeen"))}</div>
          ${cands.map(([r, m]) => `<a class="cand${r === String(ref).toUpperCase() ? " on" : ""}" href="#/s/${esc(m.s)}/a/${esc(m.a.id)}">
            <img loading="lazy" src="${img(m.a.cover)}" alt=""><span><b>${esc(r)}</b><small>${esc(m.a.title)}</small></span>${ICON.chevron}</a>`).join("")}</div>` : ""}
        <div class="row" style="margin-top:12px">
          <a class="btn small" href="#/search?q=${encodeURIComponent(q)}">${esc(t("searchMyStores"))}</a>
          <a class="btn small ghost" href="https://www.google.com/search?q=${encodeURIComponent([name, ref].filter(Boolean).join(" "))}" target="_blank" rel="noopener">Google</a>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:12px">${esc(t("aiWarn"))}</p>
      </div>`;
      const rc = $("#refCopy");
      if (rc) rc.onclick = () => copy(ref);
      return d;
    } catch (e) {
      el.innerHTML = `<div class="panel ident"><p class="muted" style="margin:0">${esc(t("identUnavailable", { e: e.message }))}</p></div>`;
      return null;
    }
  }

  function toJpegBase64(file, max) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      im.onerror = reject;
      im.src = URL.createObjectURL(file);
    });
  }

  // ---------- Écran : modifier la liste ----------
  function viewEdit() {
    header(t("myStores"), { back: true });
    const bad = stores.filter((s) => status[s] === "bad").length;
    view.innerHTML = `
      ${bigTitle(t("myStores"), t("storesSub", { n: stores.length }))}
      <form class="searchbar" id="addf">
        <label class="field"><input id="add" placeholder="${esc(t("addPh"))}" autocomplete="off" autocapitalize="off"></label>
        <button class="btn small">${esc(t("addBtn"))}</button>
      </form>
      <div class="row" style="margin-bottom:16px">
        <button class="btn small ghost" id="check">${esc(t("testAll"))}</button>
        ${bad ? `<button class="btn small ghost" id="rmbad">${esc(t("removeBad", { n: bad }))}</button>` : ""}
      </div>
      <div class="list">${stores.map((s, i) => `
        <div class="er"><i class="lg"><i class="dot ${status[s] || ""}"></i></i><span>${esc(s)}</span>
          <button data-ren="${i}">${esc(t("rename"))}</button><button class="del" data-del="${i}">${esc(t("remove"))}</button></div>`).join("")}</div>
      <button class="btn ghost block" id="reset">${esc(t("resetList"))}</button>`;
    $("#addf").onsubmit = (e) => {
      e.preventDefault();
      const s = normalizeStore($("#add").value);
      if (!s) return toast(t("invalidName"));
      if (stores.includes(s)) return toast(t("alreadyIn"));
      stores.push(s); saveStores(); viewEdit(); toast(t("storeAdded", { s }));
    };
    view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      const s = stores[b.dataset.del];
      if (confirm(t("removeQ", { s }))) { stores.splice(b.dataset.del, 1); saveStores(); viewEdit(); }
    }));
    view.querySelectorAll("[data-ren]").forEach((b) => (b.onclick = () => {
      const old = stores[b.dataset.ren];
      const s = normalizeStore(prompt(t("renameQ"), old) || "");
      if (s && s !== old) { stores[b.dataset.ren] = s; delete status[old]; saveStores(); viewEdit(); }
    }));
    $("#reset").onclick = () => {
      if (confirm(t("resetQ"))) { stores = window.DEFAULT_STORES.slice(); saveStores(); viewEdit(); }
    };
    const rm = $("#rmbad");
    if (rm) rm.onclick = () => {
      if (confirm(t("removeBadQ"))) { stores = stores.filter((s) => status[s] !== "bad"); saveStores(); viewEdit(); }
    };
    $("#check").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = t("testing");
      const signal = newCtrl();
      await pool(stores, 4, async (s) => {
        try { await api("albums", { s }, signal); setStatus(s, "ok"); }
        catch (err) { if (err.name !== "AbortError") setStatus(s, "bad"); }
      });
      if (location.hash === "#/edit") viewEdit();
    };
  }

  // ---------- Alertes nouveautés (vérifiées sur l'index mis à jour chaque nuit) ----------
  function matchKeys(qRaw) {
    const q = norm(qRaw);
    if (q.length < 2 || !sx.docs) return [];
    const base = q.split(" ");
    const variants = [base];
    if (ALIASES[base[0]]) variants.push([...ALIASES[base[0]].split(" "), ...base.slice(1)]);
    const meta = sx.meta, out = [];
    for (let i = 0; i < sx.docs.length; i++) {
      const d = sx.docs[i];
      if (variants.some((toks) => toks.every((tk, k) => d.includes(" " + tk + " ") || (k === toks.length - 1 && d.includes(" " + tk)) || (tk.length >= 3 && sx.masks[i]?.some((re) => re.test(tk)))))) {
        out.push(`${meta.stores[meta.items[i][0]]}:${meta.items[i][1]}`);
      }
    }
    return out;
  }
  async function addAlert(q) {
    await buildSearchIndex().catch(() => {});
    if (alerts.some((a) => a.q.toLowerCase() === q.toLowerCase())) return;
    alerts.push({ q, seen: matchKeys(q), t: Date.now(), fresh: [] });
    saveAlerts(); toast(t("alertAdded", { q }));
    if (currentRoute === "search") renderResults();
  }
  async function checkAlerts() {
    if (!alerts.length) return;
    await buildSearchIndex();
    for (const a of alerts) { const seen = new Set(a.seen); a.fresh = matchKeys(a.q).filter((k) => !seen.has(k)); }
    const n = alertNewTotal();
    try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {}
    renderTabs(); setTab(currentTab);
    if (currentRoute === "stores" && n) viewStores();
  }
  function albumFromKey(key) {
    const i = ps.index?.byKey?.get(key) ?? sx.keyIndex?.get(key);
    if (i == null) return null;
    const it = sx.meta.items[i];
    return { s: sx.meta.stores[it[0]], a: { id: it[1], title: it[2], cover: "https://photo.yupoo.com/" + it[3], count: it[4] } };
  }

  function viewAlerts() {
    header(t("alertsTitle"), { back: true });
    view.innerHTML = `${bigTitle(t("alertsTitle"), esc(t("alertsSub")))}
      ${alerts.length ? `<div class="list">${alerts.map((a, i) => `<a class="row-item" href="#/alert/${i}"><span class="ri-ic" style="background:var(--grad);color:#fff">${ICON.bell}</span><span>${esc(a.q)}<small>${a.fresh?.length ? esc(t("newCount", { n: a.fresh.length })) : esc(t("noNew"))}</small></span>${a.fresh?.length ? `<b class="cnt-badge">${a.fresh.length}</b>` : ""}${ICON.chevron}</a>`).join("")}</div>`
        : `<div class="empty-state"><div class="big">🔔</div>${esc(t("alertsEmpty"))}</div>`}`;
  }
  function viewAlert(i) {
    const a = alerts[+i];
    if (!a) { location.hash = "#/alerts"; return; }
    header(a.q, { back: true });
    const items = (a.fresh || []).map(albumFromKey).filter(Boolean);
    view.innerHTML = `${bigTitle(a.q, esc(t("alertNew", { q: a.q })))}
      ${items.length ? `<div class="grid stagger">${items.slice(0, 120).map((r) => itemCard(r.a, r.s, true)).join("")}</div>` : `<div class="empty-state"><div class="big">✨</div>${esc(t("noNew"))}</div>`}
      <div class="row" style="margin-top:14px">
        ${items.length ? `<button class="btn" id="seenBtn">${esc(t("markSeen"))}</button>` : ""}
        <a class="btn ghost" href="#/search?q=${encodeURIComponent(a.q)}">${esc(t("searchTitle"))}</a>
      </div>
      <button class="btn ghost block" id="delAlert" style="color:var(--err)">${esc(t("removeAlert"))}</button>`;
    const sb = $("#seenBtn");
    if (sb) sb.onclick = () => { a.seen = [...new Set([...a.seen, ...a.fresh])]; a.fresh = []; saveAlerts(); checkAlerts(); history.back(); };
    $("#delAlert").onclick = () => { alerts.splice(+i, 1); saveAlerts(); checkAlerts(); location.hash = "#/alerts"; };
  }

  // ---------- Écran : envies et panier « à commander » ----------
  let wishSeg = "wish";
  function viewWishlist() {
    header(t("wishTitle"), { large: true });
    const cart = wish.filter((w) => w.cart);
    view.innerHTML = `${bigTitle(t("wishTitle"), esc(t("wishSub", { n: wish.length })))}
      <div class="seg" style="--n:2;--i:${wishSeg === "wish" ? 0 : 1};margin-bottom:14px"><i class="seg-pill"></i>
        <button class="seg-b ${wishSeg === "wish" ? "on" : ""}" data-seg="wish">${esc(t("segWish"))} · ${wish.length}</button>
        <button class="seg-b ${wishSeg === "cart" ? "on" : ""}" data-seg="cart">${esc(t("segCart"))} · ${cart.length}</button>
      </div>
      <div id="wbody"></div>`;
    view.querySelectorAll("[data-seg]").forEach((b) => (b.onclick = () => { wishSeg = b.dataset.seg; viewWishlist(); }));
    const body = $("#wbody");
    if (wishSeg === "wish") {
      if (!wish.length) { body.innerHTML = `<div class="empty-state"><div class="big">💜</div><b>${esc(t("wishEmptyT"))}</b>${esc(t("wishEmptyS"))}</div>`; return; }
      body.innerHTML = `<div class="list">${wish.map((w, i) => {
        const pr = priceEur(w.title);
        return `<div class="wrow rise" style="animation-delay:${Math.min(i, 8) * 30}ms">
          <a href="#/s/${esc(w.s)}/a/${esc(w.id)}" class="wimg" style="background-image:url('${img(w.cover)}')"></a>
          <div class="winfo"><a href="#/s/${esc(w.s)}/a/${esc(w.id)}"><b>${esc(trTitle(w.title) || t("untitled"))}</b></a>
            <small>${esc(w.s)}${pr != null ? ` · <span class="pp">${esc(money(pr))}</span>` : ""}</small>
            <button class="wnote" data-note="${i}">${w.note ? "📝 " + esc(w.note) : "＋ " + esc(t("addNote"))}</button>
            <div class="wact"><button class="chip ${w.cart ? "on" : ""}" data-cart="${i}">${esc(t(w.cart ? "inCart" : "toCart"))}</button><button class="wdel" data-del="${i}" aria-label="✕">✕</button></div>
          </div></div>`;
      }).join("")}</div>`;
      body.querySelectorAll("[data-note]").forEach((b) => (b.onclick = () => { const w = wish[+b.dataset.note]; const n = prompt(t("noteQ"), w.note || ""); if (n != null) { w.note = n.trim(); saveWish(); viewWishlist(); } }));
      body.querySelectorAll("[data-cart]").forEach((b) => (b.onclick = () => { const w = wish[+b.dataset.cart]; w.cart = !w.cart; w.opened = false; saveWish(); viewWishlist(); }));
      body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { if (confirm(t("removeWishQ"))) { wish.splice(+b.dataset.del, 1); saveWish(); viewWishlist(); } }));
      return;
    }
    // --- panier « à commander » + estimation du coût total
    if (!cart.length) { body.innerHTML = `<div class="empty-state"><div class="big">🛒</div><b>${esc(t("cartEmptyT"))}</b>${esc(t("cartEmptyS"))}</div>`; return; }
    const est = settings.est;
    const prices = cart.map((w) => priceEur(w.title));
    const sum = prices.reduce((n, p) => n + (p || 0), 0);
    const fee = sum * (est.fee / 100);
    const domestic = cart.length * 10 * rate.v; // ≈ 10 ¥ de livraison en Chine par article
    const weight = cart.reduce((n, w) => n + (CATS[w.cat] || 0.5), 0);
    const ship = est.base + weight * est.perKg;
    const unknown = prices.filter((p) => p == null).length;
    body.innerHTML = `
      ${agent ? "" : `<a class="panel hint-row" href="#/agent">🛒 ${esc(t("noAgentYet"))} ${ICON.chevron}</a>`}
      <div class="list">${cart.map((w, i) => {
        const pr = prices[i];
        return `<div class="wrow">
          <a href="#/s/${esc(w.s)}/a/${esc(w.id)}" class="wimg" style="background-image:url('${img(w.cover)}')"></a>
          <div class="winfo"><b>${esc(trTitle(w.title) || t("untitled"))}</b>
            <small>${esc(w.s)} · ${pr != null ? `<span class="pp">${esc(money(pr))}</span>` : esc(t("priceUnknown"))}</small>
            <select class="cat-sel" data-cat="${i}">${Object.keys(CATS).map((c) => `<option value="${c}" ${w.cat === c ? "selected" : ""}>${esc(t(CAT_KEY[c]))} · ${CATS[c]} kg</option>`).join("")}</select>
            <div class="wact">${agent ? `<button class="btn small ${w.opened ? "ghost" : "grad"}" data-open="${i}">${esc(w.opened ? t("opened") : t("openNext", { a: agent.name }))}</button>` : ""}
              <button class="chip" data-uncart="${i}">✕</button></div>
          </div></div>`;
      }).join("")}</div>
      <div class="panel est rise">
        <h2>${esc(t("estimate"))}</h2>
        <div class="facts">
          <div class="fact"><span>${esc(t("estItems", { n: cart.length }))}${unknown ? ` (${unknown} ${esc(t("priceUnknown"))})` : ""}</span><b>${esc(money(sum))}</b></div>
          <div class="fact"><span>${esc(t("estFee", { p: est.fee }))}</span><b>${esc(money(fee))}</b></div>
          <div class="fact"><span>${esc(t("estDomestic"))}</span><b>${esc(money(domestic))}</b></div>
          <div class="fact"><span>${esc(t("estShip", { w: weight.toFixed(1) }))}</span><b>${esc(money(ship))}</b></div>
          <div class="fact total"><span>${esc(t("estTotal"))}</span><b>${esc(money(sum + fee + domestic + ship))}</b></div>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:12.5px">${esc(t("estNote"))}</p>
        <details class="est-set"><summary>${esc(t("estSettings"))}</summary>
          <label>${esc(t("feePct"))}<input type="number" inputmode="decimal" data-est="fee" value="${est.fee}"></label>
          <label>${esc(t("perKg"))}<input type="number" inputmode="decimal" data-est="perKg" value="${est.perKg}"></label>
          <label>${esc(t("baseShip"))}<input type="number" inputmode="decimal" data-est="base" value="${est.base}"></label>
        </details>
      </div>`;
    body.querySelectorAll("[data-cat]").forEach((sel) => (sel.onchange = () => { cart[+sel.dataset.cat].cat = sel.value; saveWish(); viewWishlist(); }));
    body.querySelectorAll("[data-uncart]").forEach((b) => (b.onclick = () => { cart[+b.dataset.uncart].cart = false; saveWish(); viewWishlist(); }));
    body.querySelectorAll("[data-est]").forEach((inp) => (inp.onchange = () => {
      const v = parseFloat(String(inp.value).replace(",", "."));
      if (!isNaN(v) && v >= 0) { settings.est = { ...settings.est, [inp.dataset.est]: v }; store.set("settings", settings); viewWishlist(); const d = view.querySelector(".est-set"); if (d) d.open = true; }
    }));
    body.querySelectorAll("[data-open]").forEach((b) => (b.onclick = async () => {
      const w = cart[+b.dataset.open];
      const win = window.open("about:blank", "_blank"); // ouvert tout de suite (sinon Safari bloque la fenêtre)
      try {
        const a = await api("album", { s: w.s, id: w.id });
        const m = a.links.map((l) => ({ url: l, m: parseMarket(l) })).find((x) => x.m);
        let url = m ? agentLink(m.m) : null;
        if (!url) {
          if (m) { try { await navigator.clipboard.writeText(m.url); toast(t("copiedPaste", { a: agent.name })); } catch {} }
          url = agent.home || a.url;
        }
        if (win) win.location.href = url; else location.href = url;
        w.opened = true; saveWish(); viewWishlist();
      } catch (e) { if (win) win.close(); toast(e.message); }
    }));
  }

  // ---------- Recadrage de la photo avant la recherche ----------
  function cropper(file, onDone) {
    const url = URL.createObjectURL(file);
    const box = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    $("#prev").innerHTML = `<div class="crop-t">${esc(t("cropTitle"))}</div>
      <div class="crop"><img src="${url}" alt="" id="cropImg"><div class="crop-box" id="cropBox"><i class="crop-h"></i></div></div>
      <div class="muted" style="margin:8px 0 10px">${esc(t("cropHint"))}</div>
      <div class="row"><button type="button" class="btn grad" id="cropGo">${ICON.search} ${esc(t("cropSearch"))}</button><button type="button" class="btn ghost" id="cropFull">${esc(t("cropFull"))}</button></div>`;
    const drop = $("#drop"); drop.classList.add("has", "cropping");
    const el = $("#cropBox"), wrap = el.parentElement;
    const draw = () => Object.assign(el.style, { left: box.x * 100 + "%", top: box.y * 100 + "%", width: box.w * 100 + "%", height: box.h * 100 + "%" });
    draw();
    let mode = null, sx0, sy0, b0;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      mode = e.target.classList.contains("crop-h") ? "size" : "move";
      sx0 = e.clientX; sy0 = e.clientY; b0 = { ...box };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!mode) return;
      const r = wrap.getBoundingClientRect();
      const dx = (e.clientX - sx0) / r.width, dy = (e.clientY - sy0) / r.height;
      if (mode === "move") { box.x = Math.min(Math.max(0, b0.x + dx), 1 - box.w); box.y = Math.min(Math.max(0, b0.y + dy), 1 - box.h); }
      else { box.w = Math.min(Math.max(0.15, b0.w + dx), 1 - box.x); box.h = Math.min(Math.max(0.15, b0.h + dy), 1 - box.y); }
      draw();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", () => (mode = null));
    // le cadre ne doit pas ouvrir le sélecteur de photo
    $("#prev").addEventListener("click", (e) => { if (e.target.closest(".crop, button")) e.preventDefault(); });
    $("#cropFull").onclick = (e) => { e.preventDefault(); drop.classList.remove("cropping"); onDone(file, url); };
    $("#cropGo").onclick = (e) => {
      e.preventDefault();
      const im = $("#cropImg");
      const c = document.createElement("canvas");
      const W = im.naturalWidth, H = im.naturalHeight;
      c.width = Math.round(W * box.w); c.height = Math.round(H * box.h);
      c.getContext("2d").drawImage(im, W * box.x, H * box.y, c.width, c.height, 0, 0, c.width, c.height);
      c.toBlob((blob) => { drop.classList.remove("cropping"); onDone(blob || file, URL.createObjectURL(blob || file)); }, "image/jpeg", 0.92);
    };
  }

  // ---------- Écran : réglages ----------
  function viewSettings() {
    header(t("tabSettings"), { large: true });
    const seg = (id, val, label) => `<button class="seg-b ${settings.theme === val ? "on" : ""}" data-theme="${val}">${label}</button>`;
    view.innerHTML = `
      ${bigTitle(t("tabSettings"), esc(t("settingsSub")))}
      <div class="group-title">${esc(t("appearance"))}</div>
      <div class="list pad">
        <div class="seg" style="--n:3;--i:${["auto", "light", "dark"].indexOf(settings.theme)}"><i class="seg-pill"></i>
          ${seg("auto", "auto", esc(t("themeAuto")))}${seg("light", "light", esc(t("themeLight")))}${seg("dark", "dark", esc(t("themeDark")))}
        </div>
        <div class="previews">
          <div class="pv light ${settings.theme === "light" ? "on" : ""}" data-theme="light"><i></i><i></i><i></i></div>
          <div class="pv dark ${settings.theme === "dark" ? "on" : ""}" data-theme="dark"><i></i><i></i><i></i></div>
        </div>
      </div>
      <div class="list"><label class="row-item switch-row"><span>🈯 ${esc(t("translateTitles"))}</span><input type="checkbox" class="switch" id="trSw" ${settings.translate ? "checked" : ""}></label></div>
      <div class="group-title">${esc(t("color"))}</div>
      <div class="list pad"><div class="swatches">${Object.entries(ACCENTS).map(([k, v]) => `
        <button class="sw ${settings.accent === k ? "on" : ""}" data-accent="${k}" aria-label="${esc(t("c" + k[0].toUpperCase() + k.slice(1)))}">
          <i style="background:${v.g}"></i><span>${esc(t("c" + k[0].toUpperCase() + k.slice(1)))}</span></button>`).join("")}</div></div>
      <div class="group-title">${esc(t("language"))}</div>
      <div class="list">${LANGS.map((l) => `<button class="row-item" data-lang="${l}"><span class="flag">${{ fr: "🇫🇷", en: "🇬🇧", es: "🇪🇸" }[l] || "🌐"}</span><span>${esc(window.I18N[l].langName)}</span>${lang() === l ? `<i class="ck">${ICON.check}</i>` : ""}</button>`).join("")}</div>
      <div class="group-title">${esc(t("account"))}</div>
      <div class="list">
        <a class="row-item" href="#/agent"><span class="ri-ic" style="background:#ff9f0a">🛒</span><span>${esc(t("myAgent"))}<small>${agent ? esc(agent.name) : esc(t("notConfigured"))}</small></span>${ICON.chevron}</a>
        <a class="row-item" href="#/edit"><span class="ri-ic" style="background:#34c759">🛍️</span><span>${esc(t("myStores"))}<small>${stores.length}</small></span>${ICON.chevron}</a>
        <a class="row-item" href="#/alerts"><span class="ri-ic" style="background:#ff375f;color:#fff">${ICON.bell}</span><span>${esc(t("alertsTitle"))}<small>${alerts.length}${alertNewTotal() ? " · " + esc(t("newCount", { n: alertNewTotal() })) : ""}</small></span>${ICON.chevron}</a>
      </div>
      <div class="group-title">${esc(t("about"))}</div>
      <div class="list">
        <div class="row-item static"><span>${esc(t("indexUpdated"))}</span><small id="idxDate">…</small></div>
        <div class="row-item static"><span>${esc(t("indexAlbums"))}</span><small id="idxCount">…</small></div>
        <div class="row-item static"><span>${esc(t("version"))}</span><small>${APP_VERSION}</small></div>
      </div>`;
    view.querySelectorAll("[data-theme]").forEach((b) => (b.onclick = () => {
      settings.theme = b.dataset.theme; saveSettings();
      const segEl = view.querySelector(".seg");
      segEl.style.setProperty("--i", ["auto", "light", "dark"].indexOf(settings.theme));
      view.querySelectorAll(".seg-b").forEach((x) => x.classList.toggle("on", x.dataset.theme === settings.theme));
      view.querySelectorAll(".pv").forEach((x) => x.classList.toggle("on", x.dataset.theme === settings.theme));
    }));
    $("#trSw").onchange = (e) => { settings.translate = e.target.checked; saveSettings(); };
    view.querySelectorAll("[data-accent]").forEach((b) => (b.onclick = () => {
      settings.accent = b.dataset.accent; saveSettings();
      view.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === b));
    }));
    view.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => {
      settings.lang = b.dataset.lang; saveSettings(); route(true);
    }));
    loadMeta().then((m) => {
      const d = $("#idxDate"), c = $("#idxCount");
      if (d) d.textContent = new Date(m.updated).toLocaleString(lang(), { dateStyle: "medium", timeStyle: "short" });
      if (c) c.textContent = m.items.length.toLocaleString(lang());
    }).catch(() => { const d = $("#idxDate"); if (d) d.textContent = "—"; });
  }

  // ---------- Navigation avec transitions animées ----------
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let currentRoute = "";
  let prevDepth = null, prevTab = null;

  function parseRoute() {
    const h = location.hash.slice(1) || "/";
    const [path, qs] = h.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = new URLSearchParams(qs || "");
    if (parts[0] === "s" && parts[1]) return parts[2] === "a" && parts[3]
      ? { name: "album", tab: "stores", depth: 2, run: () => viewAlbum(parts[1], parts[3]) }
      : { name: "store", tab: "stores", depth: 1, run: () => viewStore(parts[1]) };
    if (parts[0] === "search") return { name: "search", tab: "search", depth: 0, run: () => viewSearch(params.get("q") || "") };
    if (parts[0] === "photo") return { name: "photo", tab: "photo", depth: 0, run: viewPhoto };
    if (parts[0] === "settings") return { name: "settings", tab: "settings", depth: 0, run: viewSettings };
    if (parts[0] === "wishlist") return { name: "wishlist", tab: "wish", depth: 0, run: viewWishlist };
    if (parts[0] === "alerts") return { name: "alerts", tab: "search", depth: 1, run: viewAlerts };
    if (parts[0] === "alert" && parts[1] != null) return { name: "alert", tab: "search", depth: 2, run: () => viewAlert(parts[1]) };
    if (parts[0] === "edit") return { name: "edit", tab: "settings", depth: 1, run: viewEdit };
    if (parts[0] === "agent") return { name: "agent", tab: "settings", depth: 1, run: viewAgent };
    return { name: "stores", tab: "stores", depth: 0, run: viewStores };
  }

  function route(noAnim) {
    const r = parseRoute();
    let dir = "none";
    if (prevDepth !== null && !noAnim) dir = r.depth > prevDepth ? "forward" : r.depth < prevDepth ? "back" : "tab";
    if (dir === "tab" && r.tab === prevTab && r.depth > 0) dir = "forward";
    prevDepth = r.depth; prevTab = r.tab;
    const render = () => {
      currentRoute = r.name;
      window.scrollTo(0, 0);
      onScroll();
      setTab(r.tab);
      r.run();
    };
    if (dir !== "none" && !reduceMotion && document.startViewTransition) {
      document.documentElement.dataset.nav = dir;
      document.startViewTransition(render);
    } else {
      render();
      if (dir !== "none" && !reduceMotion) {
        view.classList.remove("enter-forward", "enter-back", "enter-tab");
        void view.offsetWidth;
        view.classList.add("enter-" + dir);
      }
    }
  }
  let scrolledState = null, scrollTick = false;
  const onScroll = () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      const v = window.scrollY > 30;
      if (v !== scrolledState) { scrolledState = v; document.body.classList.toggle("scrolled", v); }
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  $("#back").onclick = () => (history.length > 1 ? history.back() : (location.hash = "#/"));
  window.addEventListener("hashchange", () => route());
  applySettings();
  route();

  // prépare la recherche instantanée en arrière-plan
  refreshRate();
  const warm = () => buildSearchIndex().then(checkAlerts).catch(() => {});
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 2500);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
