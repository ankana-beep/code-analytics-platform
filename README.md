# Code Analytics Platform

Lightweight code analytics for public GitHub repositories.

The app now runs with a simpler flow:

- React frontend for starting scans and viewing results
- FastAPI backend for GitHub lookup, scan execution, and persistence
- MongoDB for saved scan results
- Redis for short-lived GitHub metadata caching
- No separate worker service
- No queue/worker stack
- No Prometheus/Grafana monitoring stack in Docker Compose

## Current Flow

```text
Frontend
  -> POST /api/v1/basic-scans
  -> GET /api/v1/github/... can be served from Redis cache
  -> FastAPI validates the repository URL
  -> FastAPI downloads the selected GitHub branch tarball
  -> FastAPI scans supported files in-process
  -> FastAPI stores the finished result in MongoDB
  -> Frontend reads scan list/detail/status from the same API
```

This keeps the existing scan endpoints intact while removing the extra worker-oriented deployment pieces.

## Services

Docker Compose now starts only:

- `frontend`
- `api`
- `mongodb`
- `redis`

## API Surface

The main routes used by the frontend are unchanged:

- `POST /api/v1/basic-scans`
- `GET /api/v1/basic-scans`
- `GET /api/v1/basic-scans/{scan_id}`
- `GET /api/v1/basic-scans/{scan_id}/status`
- `DELETE /api/v1/basic-scans/{scan_id}`
- `GET /api/v1/basic-scans/branches`
- `GET /api/v1/github/users/{username}/repositories`
- `GET /api/v1/github/repositories/{owner}/{repo}/branches`
- `GET /api/v1/health`

## Quick Start

```bash
docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- API: http://localhost:8000
- Health: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

## Local Development

Backend:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

## Environment

Start from `.env.example`.

The important backend settings are:

```env
HOST=0.0.0.0
PORT=8000
MONGODB_URL=mongodb://mongodb:27017
MONGODB_DATABASE=code_analytics
REDIS_URL=redis://redis:6379/0
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
LOG_LEVEL=INFO
CORS_ORIGINS=["*"]
```

## Project Notes

- Scans are synchronous from the API point of view, but the blocking work is pushed off the event loop with `asyncio.to_thread(...)`.
- MongoDB is optional for startup. If Mongo is unavailable, the app still runs and stores scan results in memory for the current process.
- Redis is optional and used only as a small cache for GitHub repository and branch lookups.
- The health routes remain available, but the old metrics endpoint and Docker monitoring stack were removed as part of the simplification.

## Verification

Useful checks:

```bash
python -m compileall app
docker compose config
cd frontend && npm run build
```
