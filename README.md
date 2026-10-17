# Popcorn Party

Search a movie → pick a character → see that actor's top 10 highest-rated films (with posters).
Plain HTML/CSS/JS front end plus one Netlify Function that keeps your TMDB credentials private.

## Deploy
1. Push this folder to a GitHub/GitLab repo.
2. In Netlify: **Add new site → Import an existing project**, pick the repo. Settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`, no build command).
3. **Site configuration → Environment variables**, add ONE of:
   - `TMDB_READ_TOKEN` – your v4 Read Access Token (preferred)
   - `TMDB_API_KEY` – your v3 API key
4. Deploy (or trigger a redeploy after adding the variable).

## Run locally
`npm i -g netlify-cli`, copy `.env.example` to `.env`, fill it in, then `netlify dev`.

## TMDB attribution
TMDB requires its logo plus the notice already in the footer. Download the logo from
https://www.themoviedb.org/about/logos-attribution and save it as `public/assets/tmdb-logo.svg`.

## Behavior notes
- Filmography is movie credits only; roles listed as Self/Himself/Herself/Themselves or Archive Footage are dropped.
- Movies sort by TMDB `vote_average` only (ties broken by vote count). Unrated films fall to the bottom.
- If an actor has several roles in one movie they appear together on one card.

## Security
- Strict CSP and other headers are set in `netlify.toml` (no inline scripts/styles; only your own files and TMDB images are allowed).
- The function (`netlify/functions/tmdb.mjs`) allows three actions, validates ids, returns generic errors, and declares a rate limit (60 requests/minute per IP). Confirm the rule appears in Netlify's dashboard after deploy.
- Fonts are self-hosted. Narnoor (body) and Sancreek (headings) are SIL OFL licensed, bundled via @fontsource; keep its license if you redistribute.
