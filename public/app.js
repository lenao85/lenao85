/* Yupoo Finder — appli (PWA) pour iPhone. Pas de framework, tout est ici. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const img = (u) => (u ? `/img?u=${encodeURIComponent(u)}` : "");
  const yupoo = (s) => `https://${s}.x.yupoo.com`;
  const APP_VERSION = "3.0";

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
  let settings = { theme: "auto", accent: "aurora", lang: null, ...store.get("settings", {}) };
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

  const sleep = (ms, signal) => new Promise((ok, ko) => {
    const tm = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => { clearTimeout(tm); ko(new DOMException("abort", "AbortError")); });
  });

  // Yupoo freine (erreur 429) si on va trop vite : on attend un peu et on réessaie
  async function api(path, params, signal) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`, { signal });
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

  function itemCard(a, s, showStore, score) {
    return `<a class="item" href="#/s/${esc(s)}/a/${esc(a.id)}">
      <div class="im">${a.cover ? `<img loading="lazy" src="${img(a.cover)}" alt="" onload="this.classList.add('ld')">` : ""}
        ${score != null ? `<span class="score">${Math.round(score * 100)}%</span>` : ""}
        ${a.count ? `<span class="cnt">${a.count} 📷</span>` : ""}</div>
      <div class="tt">${esc(a.title || t("untitled"))}</div>
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
  const TABS = [["stores", "#/", "grid", "tabStores"], ["search", "#/search", "search", "tabSearch"], ["photo", "#/photo", "cam", "tabPhoto"], ["settings", "#/settings", "gear", "tabSettings"]];
  let currentTab = "stores";
  function renderTabs() {
    const nav = $("#tabs");
    nav.innerHTML = `<i class="pill"></i>` + TABS.map(([id, href, ic, key]) => `<a href="${href}" data-tab="${id}" class="${id === currentTab ? "on" : ""}">${ICON[ic]}<span>${esc(t(key))}</span></a>`).join("");
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
      ${mosaic}${favs.has(s) ? `<span class="star">★</span>` : ""}
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
      <form class="searchbar" id="sf">${field(`id="sq" type="search" placeholder="${esc(t("searchAt", { s }))}" autocomplete="off" enterkeyhint="search"`)}</form>
      <div id="list" class="grid stagger"></div><div id="more"></div>
      <a class="btn ghost block" href="${yupoo(s)}" target="_blank" rel="noopener">${esc(t("openYupoo"))} ↗</a>`;
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
    header(s, { back: true });
    view.innerHTML = `<div class="photos sk">${"<i></i>".repeat(9)}</div><div class="panel sk-panel"><i></i><i></i><i></i></div>`;
    const signal = newCtrl();
    try {
      const a = await api("album", { s, id }, signal);
      const firstPhoto = a.photos[0]?.full;
      const lensUrl = firstPhoto ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(location.origin + img(firstPhoto))}` : null;
      view.innerHTML = `
        <div class="photos fade-in">${a.photos.map((p, i) => `<img loading="lazy" src="${img(p.thumb)}" data-i="${i}" alt="" onload="this.classList.add('ld')">`).join("")}</div>
        <div class="panel rise">
          <h3>${esc(a.title || "Album")}</h3>
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
      $("#simBtn").onclick = () => similarForAlbum(s, id, a.photos[0]?.thumb, $("#similar"));
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
    $("#out").innerHTML = `<div class="empty-state fade-in"><div class="big">🔎</div><b>${esc(t("searchEmptyT"))}</b>${esc(t("searchEmptyS"))}</div>
      <div class="chips wrap center-chips">${["jordan 4", "hoodie", "air force 1", "stussy", "chrome hearts", "jersey"].map((w) => `<a class="chip" href="#/search?q=${encodeURIComponent(w)}">${w}</a>`).join("")}</div>`;
  }

  function startLive(q) {
    $("#q").value = q;
    $("#q").blur();
    $("#sugg").innerHTML = "";
    history.replaceState(null, "", `#/search?q=${encodeURIComponent(q)}`);
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

  async function runSearch(q) {
    const signal = newCtrl();
    lastSearch = { q, results: [], errors: [], done: 0, filter: null, extra: [], extraState: "loading" };
    renderResults();
    const discovering = discoverOthers(q, signal); // en parallèle : autres vendeurs Yupoo
    await pool(stores, 4, async (s) => {
      if (signal.aborted) return;
      try {
        const d = await api("search", { s, q }, signal);
        setStatus(s, "ok");
        if (d.albums.length) lastSearch.results.push({ s, albums: d.albums, pages: d.pages });
      } catch (e) {
        if (e.name === "AbortError") return;
        lastSearch.errors.push(s);
      }
      lastSearch.done++;
      if (lastSearch.q === q && !signal.aborted) renderResults();
    });
    await discovering;
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
        if (lastSearch.q === q && !signal.aborted) renderResults();
      });
      lastSearch.extraState = "done";
    } catch (e) {
      if (e.name === "AbortError") return;
      lastSearch.extraState = "error";
    }
    if (lastSearch.q === q && !signal.aborted) renderResults();
  }

  function renderResults() {
    const out = $("#out");
    if (!out) return;
    const { results, errors, done, filter } = lastSearch;
    const total = results.reduce((n, r) => n + r.albums.length, 0);
    const finished = done >= stores.length;
    const shown = results.filter((r) => !filter || r.s === filter);
    // mélange : 1 album de chaque vendeur à tour de rôle, pour ne pas tout avoir du même
    const mixed = [];
    for (let i = 0; shown.some((r) => i < r.albums.length); i++) shown.forEach((r) => r.albums[i] && mixed.push([r.albums[i], r.s]));
    out.innerHTML = `
      ${finished ? "" : `<div class="progress"><i style="width:${(done / stores.length) * 100}%"></i></div>`}
      <p class="muted" style="margin:0 4px 10px">${finished ? "" : esc(t("searching", { d: done, n: stores.length }))}${t("albumsAt", { t: total, n: results.length })}
        ${finished && errors.length ? `<br><span class="err">${esc(t("noReply", { n: errors.length }))}</span>` : ""}</p>
      ${results.length > 1 ? `<div class="chips">
        <button class="chip ${filter ? "" : "on"}" data-f="">${esc(t("all"))}</button>
        ${results.slice().sort((a, b) => b.albums.length - a.albums.length).map((r) => `<button class="chip ${filter === r.s ? "on" : ""}" data-f="${esc(r.s)}">${esc(r.s)} · ${r.albums.length}${r.pages > 1 ? "+" : ""}</button>`).join("")}
      </div>` : ""}
      ${!total && !finished ? skeleton(4) : ""}
      <div class="grid">${mixed.map(([a, s]) => itemCard(a, s, true)).join("")}</div>
      ${filter && results.find((r) => r.s === filter)?.pages > 1 ? `<a class="btn ghost block" href="#/s/${esc(filter)}">${esc(t("moreAt", { s: filter }))}</a>` : ""}
      ${finished && !total ? `<div class="empty-state"><div class="big">🤷</div><b>${esc(t("nothingT"))}</b>${esc(t("nothingS"))}</div>` : ""}
      ${filter ? "" : renderExtra()}`;
    out.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { lastSearch.filter = c.dataset.f || null; renderResults(); }));
    out.querySelectorAll("[data-addstore]").forEach((b) => (b.onclick = (e) => {
      e.preventDefault();
      const st = b.dataset.addstore;
      if (!stores.includes(st)) { stores.push(st); saveStores(); }
      b.textContent = t("added"); b.disabled = true;
      toast(t("addedStore", { s: st }));
    }));
  }

  function renderExtra() {
    const { extra, extraState } = lastSearch;
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
    ps.model = await T.AutoModel.from_pretrained(VIS.model, { dtype: "q8" });
    ps.T = T;
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

  function renderMatches(el, res) {
    const n = new Set(res.map((r) => r.s)).size;
    el.innerHTML = `<p class="muted">${esc(t("similarCount", { n: res.length, s: n }))}</p>
      <div class="grid stagger">${res.map((r) => itemCard(r.a, r.s, true, r.score)).join("")}</div>`;
  }

  const statusHtml = (msg) => `<div class="spinner"></div><p class="center muted" style="padding-top:0">${esc(msg)}</p>`;

  async function similarForAlbum(s, id, thumb, el) {
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
      renderMatches(el, nearest(q, { excludeStore: s, limit: 30, perStore: 4 }));
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
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
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
        el.innerHTML = `<p class="err" style="margin-top:12px">${esc(e.message)}</p>`;
      }
      // identification par IA (marque, modèle, référence), aidée par les titres des albums ressemblants
      identifyPhoto(f, matches, $("#ident"));
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
    } catch (e) {
      el.innerHTML = `<div class="panel ident"><p class="muted" style="margin:0">${esc(t("identUnavailable", { e: e.message }))}</p></div>`;
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
  const onScroll = () => document.body.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll, { passive: true });
  $("#back").onclick = () => (history.length > 1 ? history.back() : (location.hash = "#/"));
  window.addEventListener("hashchange", () => route());
  applySettings();
  route();

  // prépare la recherche instantanée en arrière-plan
  const warm = () => buildSearchIndex().catch(() => {});
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 2500);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
