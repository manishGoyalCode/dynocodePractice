# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

DynoCode is a Python coding-practice site. Two services, one shared data file:

- **`backend/main.py`** — FastAPI app. Four endpoints: `GET /health`, `GET /problems`, `GET /problems/{id}`, `POST /run`, `POST /submit`. User-submitted Python is executed via `subprocess.run([sys.executable, "-c", guard + code], ...)` in `execute_code()` with a 2-second timeout. The "guard" prepends a module blacklist + audit hook. **This sandbox is best-effort and bypassable** (e.g. `importlib.import_module('os')` defeats the blacklist; the audit hook's `args[0] in [0, 1, 2]` check only matches integer FDs, not file paths). Do not rely on it for untrusted execution — see `~/.claude/plans/create-a-plan-moonlit-fiddle.md` for the planned replacement.
- **`frontend/app/page.js`** — Single ~1000-line client component containing both the dashboard and the problem editor (Monaco). View state is toggled via a `view` string, not Next.js routing. Talks to the backend via raw `fetch()` calls; `API_BASE` is resolved at module load from `NEXT_PUBLIC_API_URL` or `window.location.hostname:8000`. Progress (solved problems, attempts, streak, draft code) lives in `localStorage` under key `codepractice_progress`.
- **`problems.json`** (repo root) — Single source of truth for problems, including hidden `testCases` used by `/submit`. The `/problems` endpoints strip `testCases` before returning. Schema is documented in `problems.md`. The backend re-reads this file on **every request** (no caching) — `load_problems()` tries `$PROBLEMS_PATH`, then `../problems.json`, then `/app/problems.json`.

CORS allowlist is hardcoded in `backend/main.py:22-27` (localhost:3000, dynocode.in, www.dynocode.in, the DigitalOcean app URL). Adding a new deploy domain requires editing this list.

## Critical: Next.js version

`frontend/AGENTS.md` (referenced by `frontend/CLAUDE.md`) flags that this project uses Next.js 16.2.4 with React 19, which has breaking changes from older versions. **Read `frontend/node_modules/next/dist/docs/` before writing or modifying frontend routing, server components, or config.** Do not assume API conventions from earlier Next.js versions.

There are two Next config files (`next.config.js` and `next.config.mjs`); Next reads `.mjs` first, so `.js` is dead — don't edit it expecting changes to apply.

## Common commands

**Local dev (manual, with reload):**
```bash
# Backend
cd backend && pip3 install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (requires Node ≥20.9; this project's Volta default is Node 16, so install via `volta install node@20`)
cd frontend && npm install && npm run dev
```

**Local dev (one shot, no Docker):** `./deploy-vm.sh` — kills anything on :3000/:8000, starts uvicorn + `npm run dev` under `nohup`, logs to `backend/backend.log` and `frontend/frontend.log`.

**Production-style (Docker):** `./deploy.sh` runs `docker-compose up -d --build`. Compose mounts `./problems.json` as a volume at `/app/problems.json` so problem edits don't require an image rebuild.

**Backend-only on the Droplet:** `./deploy-backend.sh` — same as `deploy-vm.sh` but skips the frontend.

**Lint frontend:** `cd frontend && npm run lint` (ESLint 9 + `eslint-config-next`).

**Tests:** none exist yet for either service.

## Adding or editing problems

Edit `problems.json` and follow the schema in `problems.md`. Because `load_problems()` reads from disk on every request, edits to the mounted file in Docker take effect immediately without a rebuild. Each problem needs both `examples` (visible to the user) and `testCases` (hidden, used by `/submit`).

## Deploy URLs

Production: `https://dynocode.in` (frontend) → backend on the same DigitalOcean Droplet on port 8000. Frontend learns the backend URL from `NEXT_PUBLIC_API_URL` at build time (set in the deploy environment, not in repo).
