/* Yupoo Finder — appli (PWA) pour iPhone. Pas de framework, tout est ici. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const img = (u) => (u ? `/img?u=${encodeURIComponent(u)}` : "");
  const yupoo = (s) => `https://${s}.x.yupoo.com`;

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
    chevron: `<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m1 1 6 6-6 6"/></svg>`,
  };
  const field = (attrs) => `<label class="field">${ICON.search}<input ${attrs}></label>`;
  const bigTitle = (t, sub = "") => `<div class="bigtitle"><h2>${esc(t)}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 1800);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Lien copié"); }
    catch { prompt("Copie ce lien :", text); }
  }

  const sleep = (ms, signal) => new Promise((ok, ko) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); ko(new DOMException("abort", "AbortError")); });
  });

  // Yupoo freine (erreur 429) si on va trop vite : on attend un peu et on réessaie
  async function api(path, params, signal) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`, { signal });
      if (res.status === 429 && attempt < 4) { await sleep(1500 * 2 ** attempt + Math.random() * 1000, signal); continue; }
      const data = await res.json().catch(() => ({ error: "Réponse invalide" }));
      if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`);
      return data;
    }
  }

  function header(title, { back = false, right = "", large = false } = {}) {
    document.body.classList.toggle("large", large);
    $("#title").textContent = title;
    $("#back").hidden = !back;
    $("#topRight").innerHTML = right;
    document.title = title + " · Yupoo Finder";
  }

  function itemCard(a, s, showStore, score) {
    return `<a class="item" href="#/s/${esc(s)}/a/${esc(a.id)}">
      <div class="im">${a.cover ? `<img loading="lazy" src="${img(a.cover)}" alt="">` : ""}
        ${score != null ? `<span class="score">${Math.round(score * 100)}%</span>` : ""}
        ${a.count ? `<span class="cnt">${a.count} 📷</span>` : ""}</div>
      <div class="tt">${esc(a.title || "Sans titre")}</div>
      ${showStore ? `<div class="st">${esc(s)}</div>` : ""}
    </a>`;
  }

  // Exécute des tâches en parallèle (limite N à la fois)
  async function pool(items, n, fn) {
    let i = 0;
    const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  }

  let ctrl = null; // annule les requêtes quand on change de page
  const newCtrl = () => { if (ctrl) ctrl.abort(); ctrl = new AbortController(); return ctrl.signal; };

  // ---------- Écran : liste des vendeurs ----------
  // Aperçu (4 dernières couvertures) gardé 12 h dans le téléphone
  const PV_TTL = 12 * 3600 * 1000;
  const getPreview = (s) => { const p = store.get("pv:" + s, null); return p && Date.now() - p.t < PV_TTL ? p : null; };

  function storeCard(s) {
    const pv = getPreview(s);
    const covers = pv?.covers || [];
    const mosaic = covers.length
      ? `<div class="mosaic">${[0, 1, 2].map((i) => `<i style="background-image:url('${covers[i] ? img(covers[i]) : ""}')"></i>`).join("")}</div>`
      : `<div class="mosaic empty"></div>`;
    const sub = pv ? (pv.pages > 1 ? `${pv.pages * 120 > 999 ? Math.round(pv.pages * 120 / 100) / 10 + " k" : pv.pages * 120}+ albums` : "Catalogue") : status[s] === "bad" ? "Introuvable" : "Yupoo";
    return `<a class="store ${status[s] === "bad" ? "bad" : ""}" href="#/s/${esc(s)}" data-name="${esc(s)}">
      ${mosaic}${favs.has(s) ? `<span class="star">★</span>` : ""}
      <div class="info"><i class="logo"></i><div class="nm">${esc(s)}</div><div class="sub">${sub}</div></div>
    </a>`;
  }

  function viewStores() {
    header("Vendeurs", { large: true, right: `<button id="editBtn">Modifier</button>` });
    $("#editBtn").onclick = () => (location.hash = "#/edit");
    const sorted = [...stores].sort((a, b) => a.localeCompare(b));
    const fl = sorted.filter((s) => favs.has(s));
    view.innerHTML = `
      ${bigTitle("Vendeurs", `${stores.length} catalogues Yupoo`)}
      <a class="hero" href="#/search">
        <span class="hi">${ICON.search}</span>
        <span><b>Rechercher partout</b><span>Un article chez tous tes vendeurs</span></span>
        <span class="arrow">${ICON.chevron}</span>
      </a>
      <a class="agent-row" href="#/agent"><span class="ag-ic">🛒</span><span><b>Mon agent</b><small>${agent ? esc(agent.name) + (Object.keys(agent.templates || {}).length ? " · ouverture directe" : " · lien copié") : "Non configuré"}</small></span>${ICON.chevron}</a>
      ${fl.length ? `<div class="section-title">Favoris</div>
        <div class="favs">${fl.map((s) => {
          const c = getPreview(s)?.covers?.[0];
          return `<a class="fav" href="#/s/${esc(s)}"><span class="ring"><i ${c ? `style="background-image:url('${img(c)}')"` : ""}></i></span><span>${esc(s)}</span></a>`;
        }).join("")}</div>` : ""}
      <div class="section-title">Tous les vendeurs <small id="cnt"></small></div>
      <div class="searchbar">${field(`id="filter" type="search" placeholder="Filtrer" autocomplete="off"`)}</div>
      <div class="stores" id="grid">${sorted.map(storeCard).join("")}</div>
      ${stores.length ? "" : `<div class="empty-state"><div class="big">🛍️</div><b>Aucun vendeur</b>Touche « Modifier » pour en ajouter.</div>`}`;
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
        if (el && location.hash.replace(/^#\/?/, "") === "") { const n = document.createElement("div"); n.innerHTML = storeCard(s); n.firstElementChild.hidden = el.hidden; el.replaceWith(n.firstElementChild); }
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
      toast(favs.has(s) ? "Ajouté aux favoris" : "Retiré des favoris");
    };
    view.innerHTML = `
      ${bigTitle(s, `<a href="${yupoo(s)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(s)}.x.yupoo.com ↗</a>`)}
      <form class="searchbar" id="sf">${field(`id="sq" type="search" placeholder="Chercher chez ${esc(s)}" autocomplete="off" enterkeyhint="search"`)}</form>
      <div id="list" class="grid"></div><div id="more"></div>
      <a class="btn ghost block" href="${yupoo(s)}" target="_blank" rel="noopener">Ouvrir sur Yupoo ↗</a>`;
    const signal = newCtrl();
    const list = $("#list"), more = $("#more");
    let pageNo = 1, pages = 1, q = "", loading = false;

    async function load(reset) {
      if (loading) return;
      loading = true;
      if (reset) { list.innerHTML = ""; pageNo = 1; }
      more.innerHTML = `<div class="spinner"></div>`;
      try {
        const d = q ? await api("search", { s, q, p: pageNo }, signal) : await api("albums", { s, p: pageNo }, signal);
        setStatus(s, "ok");
        pages = d.pages;
        list.insertAdjacentHTML("beforeend", d.albums.map((a) => itemCard(a, s)).join(""));
        if (!list.children.length) more.innerHTML = `<p class="center muted">Aucun album${q ? ` pour « ${esc(q)} »` : ""}.</p>`;
        else if (pageNo < pages) more.innerHTML = `<button class="btn ghost block" id="mb">Voir plus (page ${pageNo + 1}/${pages})</button>`;
        else more.innerHTML = "";
        const mb = $("#mb");
        if (mb) mb.onclick = () => { pageNo++; load(false); };
      } catch (e) {
        if (e.name === "AbortError") return;
        if (pageNo === 1 && !q) setStatus(s, "bad");
        more.innerHTML = `<p class="center err">Impossible de charger ce vendeur.<br><span class="muted">${esc(e.message)} — vérifie le nom dans « Modifier ».</span></p>`;
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
  const platLabel = (p) => PLATFORMS[p] || "Lien";
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
    const t = agent?.templates?.[market.platform];
    return t ? t.split("{id}").join(market.id) : null;
  }

  function buyPanel(a) {
    const markets = a.links.map((l) => ({ url: l, m: parseMarket(l) })).filter((x) => x.m);
    if (!agent) {
      return `<div class="panel buy"><h2>Acheter via ton agent</h2>
        <div class="muted">Ajoute cet article au panier de ton agent (Hipobuy, Boonbuy…) en un geste.</div>
        <a class="btn grad block" href="#/agent">Configurer mon agent</a></div>`;
    }
    if (!markets.length) {
      return `<div class="panel buy"><h2>Acheter via ${esc(agent.name)}</h2>
        <div class="muted">Le vendeur n'a pas mis de lien Taobao ou Weidian dans cet album. Demande-le-lui (WhatsApp/WeChat souvent indiqués sur sa page), ou cherche le même article chez un autre vendeur.</div></div>`;
    }
    return `<div class="panel buy"><h2>Acheter via ${esc(agent.name)}</h2>
      ${markets.map((x, i) => {
        const direct = agentLink(x.m);
        return `<button class="btn ${i ? "ghost" : "grad"} block" data-buy="${i}">${direct ? "🛒 Ouvrir chez " + esc(agent.name) : "🛒 Copier le lien et ouvrir " + esc(agent.name)}<small class="plat">${platLabel(x.m.platform)}</small></button>`;
      }).join("")}
      <div class="muted" style="margin-top:8px;font-size:13px">${markets.some((x) => agentLink(x.m))
        ? "La page de l'article s'ouvre chez ton agent : choisis la taille puis « Ajouter au panier »."
        : `Le lien ${platLabel(markets[0].m.platform)} est copié : colle-le dans la barre de recherche de ${esc(agent.name)}. <a href="#/agent" style="color:var(--accent)">Apprends le format à l'appli</a> pour ouvrir l'article directement.`}</div>
    </div>`;
  }

  function bindBuy(a) {
    const markets = a.links.map((l) => ({ url: l, m: parseMarket(l) })).filter((x) => x.m);
    view.querySelectorAll("[data-buy]").forEach((b) => (b.onclick = async () => {
      const x = markets[+b.dataset.buy];
      const direct = agentLink(x.m);
      if (direct) { window.open(direct, "_blank", "noopener"); return; }
      try { await navigator.clipboard.writeText(x.url); toast("Lien copié, colle-le chez " + agent.name); } catch {}
      if (agent.home) window.open(agent.home, "_blank", "noopener");
    }));
  }

  function viewAgent() {
    header("Mon agent", { back: true });
    const cur = agent || { name: "", home: "", templates: {} };
    const tpl = cur.templates || {};
    view.innerHTML = `
      ${bigTitle("Mon agent", "Ajoute les articles au panier de ton agent en un geste")}
      <div class="panel">
        <h2>1. Choisis ton agent</h2>
        <div class="chips" style="flex-wrap:wrap;margin:8px 0 0">${AGENTS.map((g) => `<button class="chip ${cur.name === g.name ? "on" : ""}" data-ag="${esc(g.name)}">${esc(g.name)}</button>`).join("")}<button class="chip ${cur.name && !AGENTS.some((g) => g.name === cur.name) ? "on" : ""}" data-ag="">Autre</button></div>
        <label class="field" style="margin-top:12px"><input id="agName" placeholder="Nom de l'agent" value="${esc(cur.name)}"></label>
        <label class="field" style="margin-top:8px"><input id="agHome" placeholder="Adresse du site (ex : https://www.boonbuy.com)" value="${esc(cur.home)}" autocapitalize="off"></label>
      </div>
      <div class="panel">
        <h2>2. Apprends le format à l'appli</h2>
        <div class="muted" style="line-height:1.45">Sur le site de ton agent, ouvre n'importe quel article venant de <b>Weidian</b>, copie l'adresse de la page et colle-la ci-dessous. Fais pareil avec un article <b>Taobao</b>. L'appli saura alors ouvrir directement chaque article chez ton agent.</div>
        ${Object.entries(PLATFORMS).map(([k, label]) => `
          <div class="learn"><div class="learn-h"><b>Article ${label}</b>${tpl[k] ? `<span class="okk">✓ Appris</span>` : `<span class="muted">optionnel</span>`}</div>
          <label class="field"><input data-learn="${k}" placeholder="Lien d'un article ${label} chez ton agent" autocapitalize="off" autocomplete="off"></label>
          ${tpl[k] ? `<div class="muted tplv">${esc(tpl[k])}</div>` : ""}</div>`).join("")}
      </div>
      <button class="btn block" id="agSave">Enregistrer</button>
      ${agent ? `<button class="btn ghost block" id="agDel" style="color:var(--err)">Retirer mon agent</button>` : ""}
      <div class="panel" style="margin-top:16px"><h2>🔒 Ton compte reste privé</h2>
        <div class="muted" style="line-height:1.45">L'appli ne te demande jamais ton mot de passe. Connecte-toi une fois sur le site de ton agent dans Safari : comme tu restes connecté, chaque article que l'appli ouvre arrive directement sur ton compte. Tu n'as plus qu'à choisir la taille et toucher « Ajouter au panier ».</div></div>`;
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
      if (!name) return toast("Choisis ton agent");
      if (home && !/^https?:\/\//i.test(home)) home = "https://" + home;
      const templates = { ...(agent?.name === name ? agent.templates : {}) };
      for (const inp of view.querySelectorAll("[data-learn]")) {
        if (!inp.value.trim()) continue;
        const r = learnTemplate(inp.value);
        if (!r) return toast(`Lien ${PLATFORMS[inp.dataset.learn]} non reconnu`);
        if (r.guess && r.guess !== inp.dataset.learn && !confirm(`Ce lien ressemble à un article ${PLATFORMS[r.guess]}, pas ${PLATFORMS[inp.dataset.learn]}. L'utiliser quand même ?`)) return;
        templates[inp.dataset.learn] = r.template;
        if (!home) { try { home = new URL(inp.value.trim()).origin; } catch {} }
      }
      agent = { name, home, templates };
      saveAgent(); toast(`${name} enregistré`); viewAgent();
    };
    const del = $("#agDel");
    if (del) del.onclick = () => { if (confirm("Retirer ton agent ?")) { agent = null; store.set("agent", null); viewAgent(); } };
  }

  // ---------- Écran : un album ----------
  async function viewAlbum(s, id) {
    header(s, { back: true });
    view.innerHTML = `<div class="spinner"></div>`;
    const signal = newCtrl();
    try {
      const a = await api("album", { s, id }, signal);
      const firstPhoto = a.photos[0]?.full;
      const lensUrl = firstPhoto ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(location.origin + img(firstPhoto))}` : null;
      view.innerHTML = `
        <div class="photos fade-in">${a.photos.map((p, i) => `<img loading="lazy" src="${img(p.thumb)}" data-i="${i}" alt="">`).join("")}</div>
        <div class="panel">
          <h3>${esc(a.title || "Album")}</h3>
          <div class="muted">${a.photos.length} photos · <a href="#/s/${esc(s)}" style="color:var(--accent)">${esc(s)}</a></div>
          <div class="row" style="margin-top:14px">
            <a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener">Ouvrir sur Yupoo</a>
            <button class="btn ghost" id="cp">Copier le lien</button>
          </div>
        </div>
        ${buyPanel(a)}
        ${a.links.length ? `<div class="panel links"><h2>Liens d'achat</h2>${a.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div>` : ""}
        <div class="panel"><h2>Le même article ailleurs</h2>
          <div class="muted">Chez tes autres vendeurs</div>
          <div id="similar"><button class="btn grad block" id="simBtn">${ICON.cam} Rechercher par photo</button></div>
          <div class="row" style="margin-top:8px">
            <button class="btn small ghost" id="same">Par le titre</button>
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
      view.innerHTML = `<p class="center err">Album introuvable.<br><span class="muted">${esc(e.message)}</span></p>
        <a class="btn ghost block" href="${esc(yupoo(s))}/albums/${esc(id)}?uid=1" target="_blank" rel="noopener">Essayer sur Yupoo ↗</a>`;
    }
  }

  // Garde les mots utiles d'un titre (retire prix, symboles, chinois)
  function keywords(t) {
    return (t || "")
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
    requestAnimationFrame(() => sc.children[start]?.scrollIntoView());
  }
  $("#lbClose").onclick = () => { $("#lightbox").hidden = true; $("#lbScroll").innerHTML = ""; };

  // ---------- Écran : recherche sur tous les vendeurs ----------
  let lastSearch = { q: "", results: [], errors: [], done: 0, filter: null, extra: [], extraState: "" };

  function viewSearch(q0) {
    header("Recherche", { large: true });
    view.innerHTML = `
      ${bigTitle("Recherche", `Chez tes ${stores.length} vendeurs à la fois`)}
      <form class="searchbar" id="f">
        ${field(`id="q" type="search" placeholder="jordan 4, stussy hoodie…" autocomplete="off" enterkeyhint="search" value="${esc(q0 || lastSearch.q)}"`)}
      </form>
      <div id="out"></div>`;
    $("#f").onsubmit = (e) => {
      e.preventDefault();
      const q = $("#q").value.trim();
      if (!q) return;
      $("#q").blur();
      history.replaceState(null, "", `#/search?q=${encodeURIComponent(q)}`);
      runSearch(q);
    };
    if (q0 && q0 !== lastSearch.q) runSearch(q0);
    else if (lastSearch.q) renderResults();
    else $("#out").innerHTML = `<div class="empty-state"><div class="big">🔎</div><b>Trouve un article partout</b>Les titres Yupoo sont souvent en anglais : « hoodie », « jacket », « sneakers »…</div>
      <div class="chips" style="justify-content:center;flex-wrap:wrap">${["jordan 4", "hoodie", "jacket", "cap", "bag", "jersey"].map((w) => `<a class="chip" href="#/search?q=${encodeURIComponent(w)}">${w}</a>`).join("")}</div>`;
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
    const { q, results, errors, done, filter } = lastSearch;
    const total = results.reduce((n, r) => n + r.albums.length, 0);
    const finished = done >= stores.length;
    const shown = results.filter((r) => !filter || r.s === filter);
    // mélange : 1 album de chaque vendeur à tour de rôle, pour ne pas tout avoir du même
    const mixed = [];
    for (let i = 0; shown.some((r) => i < r.albums.length); i++) shown.forEach((r) => r.albums[i] && mixed.push([r.albums[i], r.s]));
    out.innerHTML = `
      ${finished ? "" : `<div class="progress"><i style="width:${(done / stores.length) * 100}%"></i></div>`}
      <p class="muted" style="margin:0 4px 10px">${finished ? "" : `Recherche… ${done}/${stores.length} vendeurs · `}<b>${total}</b> albums chez ${results.length} vendeurs
        ${finished && errors.length ? `<br><span class="err">${errors.length} vendeur(s) n'ont pas répondu</span>` : ""}</p>
      ${results.length > 1 ? `<div class="chips">
        <button class="chip ${filter ? "" : "on"}" data-f="">Tous</button>
        ${results.slice().sort((a, b) => b.albums.length - a.albums.length).map((r) => `<button class="chip ${filter === r.s ? "on" : ""}" data-f="${esc(r.s)}">${esc(r.s)} · ${r.albums.length}${r.pages > 1 ? "+" : ""}</button>`).join("")}
      </div>` : ""}
      <div class="grid">${mixed.map(([a, s]) => itemCard(a, s, true)).join("")}</div>
      ${filter && results.find((r) => r.s === filter)?.pages > 1 ? `<a class="btn ghost block" href="#/s/${esc(filter)}">Plus de résultats chez ${esc(filter)}</a>` : ""}
      ${finished && !total ? `<div class="empty-state"><div class="big">🤷</div><b>Rien trouvé chez tes vendeurs</b>Regarde les autres vendeurs ci-dessous, essaie un autre mot (souvent en anglais) ou la recherche par photo.</div>` : ""}
      ${filter ? "" : renderExtra()}`;
    out.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { lastSearch.filter = c.dataset.f || null; renderResults(); }));
    out.querySelectorAll("[data-addstore]").forEach((b) => (b.onclick = (e) => {
      e.preventDefault();
      const st = b.dataset.addstore;
      if (!stores.includes(st)) { stores.push(st); saveStores(); }
      b.textContent = "✓ Ajouté"; b.disabled = true;
      toast(`${st} ajouté à tes vendeurs`);
    }));
  }

  function renderExtra() {
    const { extra, extraState } = lastSearch;
    if (!extra.length && extraState !== "loading") return extraState === "done" ? "" : "";
    return `<div class="section-title" style="margin-top:26px">Autres vendeurs Yupoo <small>pas dans ta liste</small></div>
      ${extra.map((r) => `<div class="other">
        <div class="other-head"><i class="lg"></i><a href="#/s/${esc(r.s)}"><b>${esc(r.s)}</b><small>${r.albums.length}${r.pages > 1 ? "+" : ""} albums trouvés</small></a>
          ${stores.includes(r.s) ? `<span class="muted">✓ Dans ta liste</span>` : `<button class="btn small ghost" data-addstore="${esc(r.s)}">+ Ajouter</button>`}</div>
        <div class="hscroll">${r.albums.slice(0, 8).map((a) => itemCard(a, r.s)).join("")}</div>
      </div>`).join("")}
      ${extraState === "loading" ? `<div class="spinner"></div><p class="center muted" style="padding-top:0">Recherche d'autres vendeurs…</p>` : ""}`;
  }

  // ---------- Recherche visuelle (dans l'iPhone) ----------
  // Le modèle DINOv2 calcule une « empreinte » de la photo ; on la compare aux empreintes
  // des couvertures d'albums de tous les vendeurs (index construit chaque nuit par GitHub).
  const VIS = { lib: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2", model: "Xenova/dinov2-small", dim: 384 };
  const ps = { T: null, proc: null, model: null, index: null, loading: null };

  async function loadModel(onStatus) {
    if (ps.model) return;
    onStatus("Chargement du moteur photo (≈ 25 Mo, seulement la 1re fois)…");
    const T = await import(VIS.lib);
    T.env.allowLocalModels = false;
    T.env.remoteHost = location.origin + "/models/"; // modèle relayé par notre serveur
    ps.proc = await T.AutoProcessor.from_pretrained(VIS.model);
    ps.model = await T.AutoModel.from_pretrained(VIS.model, { dtype: "q8" });
    ps.T = T;
  }

  async function loadIndex(onStatus) {
    if (ps.index) return ps.index;
    onStatus("Chargement de l'index des vendeurs…");
    const [mr, vr] = await Promise.all([fetch("/index/meta.json"), fetch("/index/vecs.bin")]);
    if (!mr.ok || !vr.ok) throw new Error("L'index n'est pas encore prêt (il se construit chaque nuit). Réessaie plus tard.");
    const meta = await mr.json();
    const vecs = new Int8Array(await vr.arrayBuffer());
    if (meta.model !== VIS.model || meta.dim !== VIS.dim) throw new Error("Index d'une ancienne version, il sera refait cette nuit.");
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

  function renderMatches(el, res, note = "") {
    const stores = new Set(res.map((r) => r.s)).size;
    el.innerHTML = `<p class="muted">${note}${res.length} albums ressemblants chez ${stores} vendeurs (du plus au moins ressemblant)</p>
      <div class="grid">${res.map((r) => itemCard(r.a, r.s, true, r.score)).join("")}</div>`;
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
        if (!thumb) throw new Error("Pas de photo dans cet album");
        await loadModel(st);
        st("Analyse de la photo…");
        q = await embedBlob(await (await fetch(img(thumb))).blob());
      }
      renderMatches(el, nearest(q, { excludeStore: s, limit: 30, perStore: 4 }));
    } catch (e) {
      el.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }

  // ---------- Écran : recherche par photo ----------
  function viewPhoto() {
    header("Photo", { large: true });
    view.innerHTML = `
      ${bigTitle("Photo", "Retrouve un article grâce à une image")}
      <form id="lensForm" method="post" enctype="multipart/form-data" action="https://lens.google.com/v3/upload?hl=fr" target="_blank">
        <label class="drop" id="drop">
          <input type="file" name="encoded_image" id="file" accept="image/*" hidden>
          <div id="prev"><div class="cam">${ICON.cam}</div><b>Prendre ou choisir une photo</b><div class="muted">Capture d'écran, photo d'un vêtement, d'une paire…</div></div>
        </label>
        <div id="ident"></div>
        <div id="results"></div>
        <div id="actions" hidden>
          <div class="panel" style="margin-top:14px">
            <h2>Pas trouvé ? Chercher sur tout Internet</h2>
            <button class="btn ghost block" type="submit">Google Lens</button>
            <button class="btn ghost block" type="button" id="bing">Bing</button>
            <div class="muted" style="margin-top:8px">Dans Lens, ajoute le mot <b>yupoo</b> à la recherche pour ne garder que les albums Yupoo.</div>
          </div>
        </div>
      </form>
      <div class="panel" id="howto" style="margin-top:16px">
        <h2>Comment ça marche</h2>
        <div class="muted" style="line-height:1.45">L'appli compare ta photo aux albums de tous tes vendeurs et te montre les plus ressemblants, avec un pourcentage de ressemblance. L'index est mis à jour chaque nuit.<br><br>💡 Recadre la photo sur l'article (sans le décor) pour de meilleurs résultats.</div>
      </div>`;
    const file = $("#file");
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      $("#prev").innerHTML = `<img src="${url}" alt=""><div class="muted" style="margin-top:8px">Touche pour changer de photo</div>`;
      $("#drop").classList.add("has");
      $("#actions").hidden = false;
      $("#howto").hidden = true;
      const el = $("#results");
      const st = (m) => (el.innerHTML = statusHtml(m));
      $("#ident").innerHTML = "";
      let matches = [];
      try {
        await Promise.all([loadModel(st), loadIndex(() => {})]);
        st("Analyse de la photo…");
        const q = await embedBlob(f);
        st("Comparaison avec tous les vendeurs…");
        await new Promise((r) => setTimeout(r, 30));
        matches = nearest(q);
        renderMatches(el, matches, "");
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
    el.innerHTML = `<div class="panel ident">${statusHtml("Identification de l'article…")}</div>`;
    try {
      const image = await toJpegBase64(file, 768);
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image, hints }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) throw new Error(d.error || "Service indisponible");
      const ref = d.reference;
      const name = [d.marque, d.modele].filter(Boolean).join(" ");
      const facts = [
        ["Référence", ref], ["Coloris", d.coloris], ["Catégorie", d.categorie], ["Collab", d.collab],
        ["Année", d.annee], ["Origine de la marque", d.pays_marque], ["Prix officiel", d.prix_officiel],
      ].filter(([, v]) => v && String(v).toLowerCase() !== "null");
      const conf = { haute: ["Sûr", "ok"], moyenne: ["Probable", "mid"], faible: ["Incertain", "low"] }[String(d.confiance).toLowerCase()] || ["Estimation", "mid"];
      const q = ref || name;
      el.innerHTML = `<div class="panel ident fade-in">
        <div class="ident-top"><span class="ai">✨ Identifié par IA</span><span class="conf ${conf[1]}">${conf[0]}</span></div>
        ${d.marque ? `<div class="brand">${esc(d.marque)}</div>` : ""}
        <h3>${esc(d.modele || name || "Article")}</h3>
        <div class="facts">${facts.map(([k, v]) => `<div class="fact"${k === "Référence" ? ` id="refCopy"` : ""}><span>${k}</span><b>${esc(v)}${k === "Référence" ? " ⧉" : ""}</b></div>`).join("")}</div>
        ${d.explication ? `<p class="muted" style="margin:10px 0 0">${esc(d.explication)}</p>` : ""}
        ${cands.length ? `<div class="cands"><div class="muted" style="margin:14px 0 6px">Références vues dans les albums ressemblants :</div>
          ${cands.map(([r, m]) => `<a class="cand${r === String(ref).toUpperCase() ? " on" : ""}" href="#/s/${esc(m.s)}/a/${esc(m.a.id)}">
            <img loading="lazy" src="${img(m.a.cover)}" alt=""><span><b>${esc(r)}</b><small>${esc(m.a.title)}</small></span>${ICON.chevron}</a>`).join("")}</div>` : ""}
        <div class="row" style="margin-top:12px">
          <a class="btn small" href="#/search?q=${encodeURIComponent(q)}">Chercher chez mes vendeurs</a>
          <a class="btn small ghost" href="https://www.google.com/search?q=${encodeURIComponent([name, ref].filter(Boolean).join(" "))}" target="_blank" rel="noopener">Google</a>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:12px">L'IA peut se tromper : vérifie la référence avant d'acheter.</p>
      </div>`;
      const rc = $("#refCopy");
      if (rc) rc.onclick = () => copy(ref);
    } catch (e) {
      el.innerHTML = `<div class="panel ident"><p class="muted" style="margin:0">Identification indisponible pour le moment (${esc(e.message)}).</p></div>`;
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
    header("Modifier", { back: true });
    const bad = stores.filter((s) => status[s] === "bad").length;
    view.innerHTML = `
      ${bigTitle("Mes vendeurs", `${stores.length} vendeurs · <span class="dot ok"></span> fonctionne · <span class="dot bad"></span> introuvable`)}
      <form class="searchbar" id="addf">
        <label class="field"><input id="add" placeholder="Lien ou nom Yupoo à ajouter" autocomplete="off" autocapitalize="off"></label>
        <button class="btn small">Ajouter</button>
      </form>
      <div class="row" style="margin-bottom:16px">
        <button class="btn small ghost" id="check">Tester tous les vendeurs</button>
        ${bad ? `<button class="btn small ghost" id="rmbad">Retirer les ${bad} en erreur</button>` : ""}
      </div>
      <div class="list">${stores.map((s, i) => `
        <div class="er"><i class="lg"><i class="dot ${status[s] || ""}"></i></i><span>${esc(s)}</span>
          <button data-ren="${i}">Renommer</button><button class="del" data-del="${i}">Retirer</button></div>`).join("")}</div>
      <button class="btn ghost block" id="reset">Remettre la liste de départ</button>`;
    $("#addf").onsubmit = (e) => {
      e.preventDefault();
      const s = normalizeStore($("#add").value);
      if (!s) return toast("Nom invalide");
      if (stores.includes(s)) return toast("Déjà dans la liste");
      stores.push(s); saveStores(); viewEdit(); toast(`${s} ajouté`);
    };
    view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      const s = stores[b.dataset.del];
      if (confirm(`Retirer ${s} ?`)) { stores.splice(b.dataset.del, 1); saveStores(); viewEdit(); }
    }));
    view.querySelectorAll("[data-ren]").forEach((b) => (b.onclick = () => {
      const old = stores[b.dataset.ren];
      const s = normalizeStore(prompt("Nouveau nom ou lien Yupoo :", old) || "");
      if (s && s !== old) { stores[b.dataset.ren] = s; delete status[old]; saveStores(); viewEdit(); }
    }));
    $("#reset").onclick = () => {
      if (confirm("Remettre la liste de départ ?")) { stores = window.DEFAULT_STORES.slice(); saveStores(); viewEdit(); }
    };
    const rm = $("#rmbad");
    if (rm) rm.onclick = () => {
      if (confirm("Retirer les vendeurs en erreur ?")) { stores = stores.filter((s) => status[s] !== "bad"); saveStores(); viewEdit(); }
    };
    $("#check").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "Test en cours…";
      const signal = newCtrl();
      await pool(stores, 4, async (s) => {
        try { await api("albums", { s }, signal); setStatus(s, "ok"); }
        catch (err) { if (err.name !== "AbortError") setStatus(s, "bad"); }
      });
      if (location.hash === "#/edit") viewEdit();
    };
  }

  // ---------- Navigation ----------
  function route() {
    const h = location.hash.slice(1) || "/";
    const [path, qs] = h.split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean);
    let tab = "stores";
    window.scrollTo(0, 0);
    onScroll();
    if (parts[0] === "s" && parts[1]) {
      parts[2] === "a" && parts[3] ? viewAlbum(parts[1], parts[3]) : viewStore(parts[1]);
    } else if (parts[0] === "search") { tab = "search"; viewSearch(params.get("q") || ""); }
    else if (parts[0] === "photo") { tab = "photo"; viewPhoto(); }
    else if (parts[0] === "edit") viewEdit();
    else if (parts[0] === "agent") viewAgent();
    else viewStores();
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  }
  const onScroll = () => document.body.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll, { passive: true });
  $("#back").onclick = () => (history.length > 1 ? history.back() : (location.hash = "#/"));
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
