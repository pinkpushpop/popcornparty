(() => {
  const app = document.getElementById("app");
  const crumbs = document.getElementById("crumbs");
  const status = document.getElementById("status");
  const IMG = "https://image.tmdb.org/t/p/";
  const cache = new Map();
  const FIELDS = {
    search: [], results: ["query"], cast: ["query", "movie"],
    actor: ["query", "movie", "character", "actor"],
  };
  let current = { step: "search" };
  let token = 0;

  function h(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
    return n;
  }

  async function api(params) {
    const qs = new URLSearchParams(params).toString();
    if (cache.has(qs)) return cache.get(qs);
    const res = await fetch(`/api/tmdb?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    cache.set(qs, data);
    return data;
  }

  const img = (path, alt, size, cls = "poster") =>
    path
      ? h("img", { class: cls, src: `${IMG}${size}${path}`, alt, loading: "lazy" })
      : h("div", { class: "noposter", role: "img", "aria-label": alt }, "No image");

  function go(step, patch = {}) {
    const merged = { ...current, ...patch };
    const next = { step };
    for (const f of FIELDS[step]) if (merged[f] !== undefined) next[f] = merged[f];
    history.pushState(next, "");
    render(next);
  }

  function renderCrumbs(s) {
    crumbs.replaceChildren();
    crumbs.hidden = s.step === "search";
    if (s.step === "search") return;
    const items = [["search", "New search"]];
    if (s.query) items.push(["results", `Results for “${s.query}”`]);
    if (s.movie && FIELDS[s.step].includes("movie")) items.push(["cast", s.movie.title]);
    if (s.step === "actor") items.push(["actor", s.actor.name]);
    crumbs.append(h("ol", {}, items.map(([step, label], i) => {
      const last = i === items.length - 1;
      return h("li", {}, last
        ? h("span", { "aria-current": "page" }, label)
        : h("button", { type: "button", onclick: () => go(step) }, label));
    })));
  }

  function loading(msg) { app.replaceChildren(h("p", { class: "loading" }, msg)); }
  function fail(err, retry) {
    app.replaceChildren(h("div", { class: "note", role: "alert" },
      h("p", {}, err.message),
      h("button", { class: "btn", type: "button", onclick: retry }, "Try again")));
  }

  function landing() {
    const input = h("input", { id: "q", type: "search", required: true, maxlength: 100,
      placeholder: "Try “Casablanca” or “Heat”", autocomplete: "off", "aria-label": "Movie title" });
    const form = h("form", { class: "search", onsubmit: (e) => {
      e.preventDefault();
      if (input.value.trim()) go("results", { query: input.value.trim() });
    } }, input, h("button", { class: "btn", type: "submit" }, "Find movie"));
    return h("section", { class: "hero" },
      h("h1", {}, "Popcorn Party"),
      h("p", { class: "lede" }, "Name a movie, pick a character, and see the actor’s highest-rated films."),
      form);
  }

  function results(data, s) {
    const list = data.results;
    if (!list.length) return h("div", { class: "note" }, `No movies matched “${s.query}”. Check the spelling or try fewer words.`);
    return h("section", { class: "panel" },
      h("h2", {}, "Which movie?"),
      h("ul", { class: "grid" }, list.map((m) => h("li", {},
        h("button", { class: "card", type: "button", onclick: () => go("cast", { movie: { id: m.id, title: m.title, year: m.year } }) },
          img(m.poster, `Poster for ${m.title}`, "w342"),
          h("span", { class: "meta" }, h("span", { class: "name" }, m.title), h("span", { class: "sub" }, m.year || "Year unknown")))))));
  }

  function cast(data, s) {
    if (!data.cast.length) return h("div", { class: "note" }, "TMDB has no cast listed for this movie.");
    return h("section", { class: "panel" },
      h("h2", {}, `${s.movie.title}${s.movie.year ? ` (${s.movie.year})` : ""}`),
      h("p", { class: "lede" }, `Pick a character. ${data.cast.length} listed.`),
      h("ul", { class: "grid cast-grid" }, data.cast.map((c) => h("li", {},
        h("button", { class: "card", type: "button", onclick: () => go("actor", { character: c.character, actor: { id: c.actorId, name: c.actor } }) },
          img(c.photo, c.actor, "w185"),
          h("span", { class: "meta" }, h("span", { class: "name" }, c.character), h("span", { class: "sub" }, c.actor)))))));
  }

  function film(m, rank) {
    const score = m.votes ? `★ ${m.rating.toFixed(1)}` : "Not yet rated";
    return h("li", { class: "film" },
      h("span", { class: "rank", "aria-label": `Rank ${rank}` }, rank),
      img(m.poster, `Poster for ${m.title}`, "w342"),
      h("div", { class: "meta card" },
        h("span", { class: "name" }, m.title),
        h("span", { class: "sub" }, m.year || "Year unknown"),
        h("span", { class: "score" }, score, m.votes ? h("span", { class: "sub" }, ` (${m.votes.toLocaleString()} votes)`) : null),
        h("span", { class: "role" }, m.roles.join(" / "))));
  }

  function actor(data, s) {
    const { movies } = data;
    const grid = h("ul", { class: "grid top-grid" }, movies.slice(0, 10).map((m, i) => film(m, i + 1)));
    const parts = [
      h("div", { class: "actor-head" },
        img(data.actor.photo, data.actor.name, "w185"),
        h("div", {}, h("h2", {}, data.actor.name),
          h("p", { class: "lede" }, `Played ${s.character} in ${s.movie.title}.`))),
      h("h2", {}, movies.length ? "Highest-rated films" : "No film roles found"),
      grid,
    ];
    if (movies.length > 10) {
      const btn = h("button", { class: "btn ghost", type: "button", onclick: () => {
        grid.append(...movies.slice(10).map((m, i) => film(m, i + 11)));
        btn.remove();
      } }, `Show all ${movies.length} roles`);
      parts.push(h("div", { class: "more" }, btn));
    }
    return h("section", { class: "panel" }, parts);
  }

  async function render(s) {
    current = s;
    const my = ++token;
    renderCrumbs(s);
    if (s.step === "search") { app.replaceChildren(landing()); app.querySelector("input").focus(); return; }
    const req = {
      results: [{ action: "search", query: s.query }, results, "Searching…"],
      cast: [{ action: "credits", id: s.movie?.id }, cast, "Loading the cast…"],
      actor: [{ action: "person", id: s.actor?.id }, actor, "Pulling the filmography…"],
    }[s.step];
    loading(req[2]);
    try {
      const data = await api(req[0]);
      if (my !== token) return;
      app.replaceChildren(req[1](data, s));
      status.textContent = { results: "Search results ready", cast: "Cast ready", actor: "Filmography ready" }[s.step];
      window.scrollTo(0, 0);
      app.focus();
    } catch (err) {
      if (my === token) fail(err, () => render(s));
    }
  }

  window.addEventListener("popstate", (e) => render(e.state || { step: "search" }));
  history.replaceState(current, "");
  render(current);
})();
