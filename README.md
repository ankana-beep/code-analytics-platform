# Code Analytics Platform

Lightweight code analytics for public GitHub repositories.

The app now runs with an API-first browser extension flow:

- FastAPI backend for GitHub lookup, scan execution, and persistence
- Browser extension for starting scans and viewing reports
- MongoDB Atlas or another external MongoDB for saved scan results
- Redis for AI summary caching and rate limiting
- No separate frontend service
- No separate worker service
- No queue/worker stack
- No Prometheus/Grafana monitoring stack in Docker Compose

## Current Flow

```text
Browser extension popup
  -> POST /api/v1/basic-scans
  -> GET /api/v1/github/... reads live GitHub metadata
  -> FastAPI validates the repository URL
  -> FastAPI downloads the selected GitHub branch tarball
  -> FastAPI scans supported files in-process
  -> FastAPI stores the finished result in MongoDB
  -> Extension report page opens chrome-extension://{extensionId}/report.html?scan_id=...
  -> Extension report page reads scan list/detail/status from the same API
```

This keeps the existing scan endpoints intact while removing the frontend and extra worker-oriented deployment pieces.

## Services

Docker Compose now starts only:

- `api`
- `redis`

## API Surface

The main routes used by the extension are:

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

- API: http://localhost:8000
- Health: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

## Local Development

Backend:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Browser extension:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the `browser-extension` folder.
5. Visit a GitHub repository and use the extension popup.

## Environment

Start from `.env.example`.

The important backend settings are:

```env
HOST=0.0.0.0
PORT=8000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DATABASE=code_analytics
REDIS_URL=redis://redis:6379/0
LOG_LEVEL=INFO
CORS_ORIGINS=["*"]
```

## Project Notes

- Scans are synchronous from the API point of view, but the blocking work is pushed off the event loop with `asyncio.to_thread(...)`.
- MongoDB is optional for startup. If Mongo is unavailable, the app still runs and stores scan results in memory for the current process.
- Redis is optional and used only for AI summary caching and rate limiting.
- The health routes remain available, but the old metrics endpoint and Docker monitoring stack were removed as part of the simplification.

## Verification

Useful checks:

```bash
python -m compileall app
docker compose config
node --check browser-extension/popup.js
node --check browser-extension/report.js
```
