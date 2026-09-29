# Deploying NAWI-ReportPro

The app has two parts:

| Part | Folder | Where it runs |
|------|--------|---------------|
| Web client (React + Vite) | `client/` | **Vercel** (static site) |
| API (Express + Prisma) | `server/` | A Node host that keeps a process running, e.g. **Render** |

The client calls the API on the relative path `/api`. On Vercel, `vercel.json` rewrites `/api/*` to the hosted API, so the browser only ever talks to the Vercel domain and no CORS setup is needed.

## 1. Deploy the API (Render, free tier)

1. Push this repo to GitHub, then create a **New Web Service** on [render.com](https://render.com) from it.
2. Settings:
   - **Root Directory:** leave empty (repo root)
   - **Build Command:** `npm install`
   - **Start Command:** `npm run demo --workspace=server`
   - **Environment variable:** `NAWI_API_PORT` = `10000` (Render's default port; or set the service port to match)
3. `npm run demo` uses the in-memory database with the full demo dataset, so no Postgres is needed. Data resets whenever the service restarts or sleeps, which is fine for evaluation.
4. Note the service URL, e.g. `https://nawi-api.onrender.com`. Check `https://nawi-api.onrender.com/api/health` (or any API route) responds.

For a persistent database instead, see "Using PostgreSQL" in the README. Set `DATABASE_URL`, `JWT_SECRET`, `HMAC_SECRET` and `NODE_ENV=production`, and use `npm start --workspace=server` as the start command.

## 2. Point `vercel.json` at the API

Edit the first rewrite in `vercel.json` and replace the placeholder host:

```json
{ "source": "/api/:path*", "destination": "https://nawi-api.onrender.com/api/:path*" }
```

Commit and push. (Rewrite destinations cannot read environment variables, so the URL must be written in the file.)

## 3. Deploy the client to Vercel

### Option A: Dashboard
1. [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. Leave **Root Directory** as the repo root. Framework preset: **Other**. The build settings come from `vercel.json`:
   - Install: `npm install`
   - Build: `npm run build` (builds `client/`)
   - Output: `client/dist`
3. Click **Deploy**.

### Option B: CLI (PowerShell)
```powershell
cd "C:\Users\sharv\OneDrive\Documents\Uni\SEM 3\SIH submission"
git clone https://github.com/GrostesqueChip/sih-final
cd sih-final
npm install
npm i -g vercel
vercel login
vercel --prod
```
Accept the defaults when prompted; the settings are read from `vercel.json`.

## 4. Verify

- Open the Vercel URL and sign in with the demo accounts listed in the README (e.g. `admin@nawi.gov.in` / `Admin@123`).
- Reload a deep link such as `/dashboard`. It should load (the SPA fallback rewrite handles this).
- If the login fails with a 404/502, the `/api` rewrite still has the placeholder host, or the Render service is asleep. The first request after idle can take about 30 seconds.

## Notes

- Live telemetry uses Server-Sent Events (`/api/telemetry/stream`). Vercel rewrites can proxy this, but connections may be cut after a while, so the client should reconnect.
- Render's free tier sleeps after inactivity. Open the API URL a minute before a demo.
