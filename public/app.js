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
  const COLORS = ["#7c5cff", "#ff7a59", "#2bb3a3", "#e2508f", "#4f8cff", "#c08a1e", "#53b257", "#a35bd6"];
  const color = (s) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 1800);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Lien copié"); }
    catch { prompt("Copie ce lien :", text); }
  }

  async function api(path, params, signal) {
    const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`, { signal });
    const data = await res.json().catch(() => ({ error: "Réponse invalide" }));
    if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  function header(title, { back = false, right = "" } = {}) {
    $("#title").textContent = title;
    $("#back").hidden = !back;
    $("#topRight").innerHTML = right;
    document.title = title + " · Yupoo Finder";
  }

  function itemCard(a, s, showStore) {
    return `<a class="item" href="#/s/${esc(s)}/a/${esc(a.id)}">
      <div class="im">${a.cover ? `<img loading="lazy" src="${img(a.cover)}" alt="">` : ""}
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
  function viewStores() {
    header("Vendeurs", { right: `<button id="editBtn">Modifier</button>` });
    $("#editBtn").onclick = () => (location.hash = "#/edit");
    const sorted = [...stores].sort((a, b) => (favs.has(b) - favs.has(a)) || a.localeCompare(b));
    view.innerHTML = `
      <div class="searchbar"><input id="filter" type="search" placeholder="Filtrer ${stores.length} vendeurs…" autocomplete="off"></div>
      <div class="stores" id="grid">${sorted.map((s) => `
        <a class="store" href="#/s/${esc(s)}" data-name="${esc(s)}">
          ${favs.has(s) ? `<span class="star">★</span>` : ""}
          <div class="av" style="background:${color(s)}">${esc(s[0].toUpperCase())}</div>
          <div class="nm">${esc(s)}</div>
        </a>`).join("")}</div>
      ${stores.length ? "" : `<p class="center muted">Aucun vendeur. Touche « Modifier » pour en ajouter.</p>`}`;
    $("#filter").oninput = (e) => {
      const q = e.target.value.toLowerCase();
      view.querySelectorAll(".store").forEach((el) => (el.hidden = !el.dataset.name.includes(q)));
    };
  }

  // ---------- Écran : albums d'un vendeur ----------
  async function viewStore(s) {
    const fav = favs.has(s);
    header(s, { back: true, right: `<button id="favBtn">${fav ? "★" : "☆"}</button>` });
    $("#favBtn").onclick = () => {
      favs.has(s) ? favs.delete(s) : favs.add(s); saveFavs();
      $("#favBtn").textContent = favs.has(s) ? "★" : "☆";
      toast(favs.has(s) ? "Ajouté aux favoris" : "Retiré des favoris");
    };
    view.innerHTML = `
      <form class="searchbar" id="sf"><input id="sq" type="search" placeholder="Chercher chez ${esc(s)}…" autocomplete="off" enterkeyhint="search"></form>
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
        <div class="panel">
          <h2>${esc(a.title || "Album")}</h2>
          <div class="muted">${a.photos.length} photos · ${esc(s)}</div>
          <div class="row" style="margin-top:10px">
            <a class="btn small" href="${esc(a.url)}" target="_blank" rel="noopener">Ouvrir sur Yupoo ↗</a>
            <button class="btn small ghost" id="cp">Copier le lien</button>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn small ghost" id="same">Chercher ailleurs (texte)</button>
            ${lensUrl ? `<a class="btn small ghost" href="${esc(lensUrl)}" target="_blank" rel="noopener">Chercher ailleurs (photo)</a>` : ""}
          </div>
        </div>
        ${a.links.length ? `<div class="panel links"><h2>Liens d'achat</h2>${a.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div>` : ""}
        <div class="photos">${a.photos.map((p, i) => `<img loading="lazy" src="${img(p.thumb)}" data-i="${i}" alt="">`).join("")}</div>`;
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
  let lastSearch = { q: "", results: [], errors: [], done: 0, filter: null };

  function viewSearch(q0) {
    header("Recherche");
    view.innerHTML = `
      <form class="searchbar" id="f">
        <input id="q" type="search" placeholder="ex : jordan 4, stussy hoodie…" autocomplete="off" enterkeyhint="search" value="${esc(q0 || lastSearch.q)}">
        <button class="btn">OK</button>
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
    else $("#out").innerHTML = `<p class="center muted">Tape un article : la recherche est lancée chez tes ${stores.length} vendeurs en même temps.<br><br>Astuce : les titres Yupoo sont souvent en anglais (« hoodie », « jacket », « sneakers »…).</p>`;
  }

  async function runSearch(q) {
    const signal = newCtrl();
    lastSearch = { q, results: [], errors: [], done: 0, filter: null };
    renderResults();
    await pool(stores, 6, async (s) => {
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
      <p class="muted">${finished ? "" : `Recherche… ${done}/${stores.length} vendeurs · `}<b>${total}</b> albums pour « ${esc(q)} » chez ${results.length} vendeurs
        ${finished && errors.length ? `<br><span class="err">${errors.length} vendeur(s) n'ont pas répondu</span>` : ""}</p>
      ${results.length > 1 ? `<div class="chips">
        <button class="chip ${filter ? "" : "on"}" data-f="">Tous</button>
        ${results.slice().sort((a, b) => b.albums.length - a.albums.length).map((r) => `<button class="chip ${filter === r.s ? "on" : ""}" data-f="${esc(r.s)}">${esc(r.s)} · ${r.albums.length}${r.pages > 1 ? "+" : ""}</button>`).join("")}
      </div>` : ""}
      <div class="grid">${mixed.map(([a, s]) => itemCard(a, s, true)).join("")}</div>
      ${filter && results.find((r) => r.s === filter)?.pages > 1 ? `<a class="btn ghost block" href="#/s/${esc(filter)}">Plus de résultats chez ${esc(filter)}</a>` : ""}
      ${finished && !total ? `<p class="center muted">Rien trouvé. Essaie un autre mot (en anglais souvent), ou la recherche par photo.</p>` : ""}`;
    out.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { lastSearch.filter = c.dataset.f || null; renderResults(); }));
  }

  // ---------- Écran : recherche par photo ----------
  function viewPhoto() {
    header("Recherche par photo");
    view.innerHTML = `
      <form id="lensForm" method="post" enctype="multipart/form-data" action="https://lens.google.com/v3/upload?hl=fr" target="_blank">
        <label class="drop" id="drop">
          <input type="file" name="encoded_image" id="file" accept="image/*" hidden>
          <div id="prev"><div style="font-size:40px">📷</div><b>Prendre ou choisir une photo</b><div class="muted">capture d'écran, photo d'un vêtement…</div></div>
        </label>
        <div id="actions" hidden>
          <button class="btn block" type="submit">Chercher avec Google Lens</button>
          <button class="btn ghost block" type="button" id="bing">Chercher avec Bing</button>
        </div>
      </form>
      <div class="panel" style="margin-top:14px">
        <h2>Comment ça marche</h2>
        <div class="muted">Google Lens s'ouvre avec ta photo et te montre les pages qui ont la même image.
        Dans Lens, ajoute le mot <b>yupoo</b> dans la barre (« Ajouter à la recherche ») pour ne garder que les albums Yupoo.<br><br>
        Depuis un album de l'appli, le bouton « Chercher ailleurs (photo) » fait la même chose avec la photo de l'album.</div>
      </div>`;
    const file = $("#file");
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      $("#prev").innerHTML = `<img src="${url}" alt=""><div class="muted" style="margin-top:8px">Touche pour changer</div>`;
      $("#actions").hidden = false;
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
    header("Modifier les vendeurs", { back: true });
    const bad = stores.filter((s) => status[s] === "bad").length;
    view.innerHTML = `
      <form class="searchbar" id="addf">
        <input id="add" placeholder="Lien ou nom (ex : abc.x.yupoo.com)" autocomplete="off" autocapitalize="off">
        <button class="btn">Ajouter</button>
      </form>
      <div class="row" style="margin-bottom:10px">
        <button class="btn small ghost" id="check">Tester tous les vendeurs</button>
        ${bad ? `<button class="btn small ghost" id="rmbad">Retirer les ${bad} en erreur</button>` : ""}
      </div>
      <p class="muted"><span class="dot ok" style="display:inline-block"></span> fonctionne · <span class="dot bad" style="display:inline-block"></span> introuvable (nom à corriger)</p>
      <div class="edit-list">${stores.map((s, i) => `
        <div class="er"><i class="dot ${status[s] || ""}"></i><span>${esc(s)}</span>
          <button data-ren="${i}">Renommer</button><button data-del="${i}">✕</button></div>`).join("")}</div>
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
      await pool(stores, 6, async (s) => {
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
    if (parts[0] === "s" && parts[1]) {
      parts[2] === "a" && parts[3] ? viewAlbum(parts[1], parts[3]) : viewStore(parts[1]);
    } else if (parts[0] === "search") { tab = "search"; viewSearch(params.get("q") || ""); }
    else if (parts[0] === "photo") { tab = "photo"; viewPhoto(); }
    else if (parts[0] === "edit") viewEdit();
    else viewStores();
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  }
  $("#back").onclick = () => (history.length > 1 ? history.back() : (location.hash = "#/"));
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
