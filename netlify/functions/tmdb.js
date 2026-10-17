// Proxy between the browser and TMDB so the credentials never reach the client.
const BASE = "https://api.themoviedb.org/3";
const SKIP_ROLE = /^(self|himself|herself|themselves)\b(?!-\w)|archive footage/i;

const reply = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": statusCode === 200 ? "public, max-age=300" : "no-store",
  },
  body: JSON.stringify(body),
});

async function tmdb(path, params = {}) {
  const token = process.env.TMDB_READ_TOKEN;
  const key = process.env.TMDB_API_KEY;
  const url = new URL(BASE + path);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = new Error(res.status === 404 ? "Not found on TMDB." : `TMDB returned ${res.status}.`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return reply(405, { error: "Method not allowed." });
  if (!process.env.TMDB_READ_TOKEN && !process.env.TMDB_API_KEY) {
    return reply(500, { error: "TMDB credentials are not set. Add TMDB_READ_TOKEN or TMDB_API_KEY in Netlify environment variables." });
  }
  const { action, query, id } = event.queryStringParameters || {};
  try {
    if (action === "search") {
      const q = (query || "").trim().slice(0, 100);
      if (!q) return reply(400, { error: "Enter a movie title." });
      const data = await tmdb("/search/movie", { query: q, include_adult: "false" });
      return reply(200, {
        results: data.results.map((m) => ({
          id: m.id, title: m.title, year: (m.release_date || "").slice(0, 4),
          poster: m.poster_path, rating: m.vote_average, votes: m.vote_count,
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
          actorId: c.id, actor: c.name, photo: c.profile_path,
        }));
      return reply(200, { cast });
    }

    if (action === "person") {
      const p = await tmdb(`/person/${id}`, { append_to_response: "movie_credits" });
      const byMovie = new Map();
      for (const c of p.movie_credits.cast) {
        const roles = (c.character || "").split("/").map((r) => r.trim()).filter((r) => r && !SKIP_ROLE.test(r));
        if (!roles.length || c.adult) continue;
        const m = byMovie.get(c.id) || {
          id: c.id, title: c.title, year: (c.release_date || "").slice(0, 4),
          poster: c.poster_path, rating: c.vote_average || 0, votes: c.vote_count || 0, roles: [],
        };
        for (const r of roles) if (!m.roles.includes(r)) m.roles.push(r);
        byMovie.set(c.id, m);
      }
      const movies = [...byMovie.values()].sort((a, b) => b.rating - a.rating || b.votes - a.votes);
      return reply(200, { actor: { id: p.id, name: p.name, photo: p.profile_path }, movies });
    }

    return reply(400, { error: "Unknown action." });
  } catch (err) {
    return reply(err.status || 500, { error: err.message || "Something went wrong." });
  }
};
