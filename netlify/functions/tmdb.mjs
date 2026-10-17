// Proxy between the browser and TMDB so credentials never reach the client.
const BASE = "https://api.themoviedb.org/3";
const SKIP_ROLE = /^(self|himself|herself|themselves)\b(?!-\w)|archive footage/i;
const IMG_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const img = (p) => (typeof p === "string" && IMG_PATH.test(p) ? p : null);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

async function tmdb(path, params = {}) {
  const token = process.env.TMDB_READ_TOKEN;
  const url = new URL(BASE + path);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`TMDB responded ${res.status} for ${path.replace(/\d+/g, ":id")}`);
    throw res.status === 404
      ? new HttpError(404, "Not found on TMDB.")
      : new HttpError(502, "The movie database is unavailable right now.");
  }
  return res.json();
}

export default async (req) => {
  if (req.method !== "GET") return reply(405, { error: "Method not allowed." });
  if (!process.env.TMDB_READ_TOKEN && !process.env.TMDB_API_KEY) {
    console.error("Neither TMDB_READ_TOKEN nor TMDB_API_KEY is set.");
    return reply(503, { error: "The movie service is temporarily unavailable." });
  }
  const p = new URL(req.url).searchParams;
  const action = p.get("action"), query = p.get("query"), id = p.get("id");
  try {
    if (action === "search") {
      const q = (query || "").trim().slice(0, 100);
      if (!q) return reply(400, { error: "Enter a movie title." });
      const data = await tmdb("/search/movie", { query: q, include_adult: "false" });
      return reply(200, {
        results: data.results.map((m) => ({
          id: m.id, title: m.title, year: (m.release_date || "").slice(0, 4),
          poster: img(m.poster_path), rating: m.vote_average, votes: m.vote_count,
        })),
      });
    }

    if (!/^\d{1,9}$/.test(id || "")) return reply(400, { error: "Invalid id." });

    if (action === "credits") {
      const data = await tmdb(`/movie/${id}/credits`);
      const cast = data.cast
        .filter((c) => c.character && c.character.trim())
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          key: c.credit_id, character: c.character.trim(),
          actorId: c.id, actor: c.name, photo: img(c.profile_path),
        }));
      return reply(200, { cast });
    }

    if (action === "person") {
      const person = await tmdb(`/person/${id}`, { append_to_response: "movie_credits" });
      const byMovie = new Map();
      for (const c of person.movie_credits.cast) {
        const roles = (c.character || "").split("/").map((r) => r.trim()).filter((r) => r && !SKIP_ROLE.test(r));
        if (!roles.length || c.adult) continue;
        const m = byMovie.get(c.id) || {
          id: c.id, title: c.title, year: (c.release_date || "").slice(0, 4),
          poster: img(c.poster_path), rating: c.vote_average || 0, votes: c.vote_count || 0, roles: [],
        };
        for (const r of roles) if (!m.roles.includes(r)) m.roles.push(r);
        byMovie.set(c.id, m);
      }
      const movies = [...byMovie.values()].sort((a, b) => b.rating - a.rating || b.votes - a.votes);
      return reply(200, { actor: { id: person.id, name: person.name, photo: img(person.profile_path) }, movies });
    }

    return reply(400, { error: "Unknown action." });
  } catch (err) {
    if (err instanceof HttpError) return reply(err.status, { error: err.message });
    console.error("tmdb function error:", err.message);
    return reply(500, { error: "Something went wrong." });
  }
};

export const config = {
  path: "/api/tmdb",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
