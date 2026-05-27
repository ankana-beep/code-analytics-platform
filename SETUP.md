# Setup Guide

The project has been simplified to an API process plus a browser extension.

## What Runs

- `api`
- `mongodb`
- `redis`

There is no separate frontend service, worker, Redis queue, or monitoring stack in the default setup.

## Start With Docker

```bash
cp .env.example .env
docker compose up --build
```

## Start Locally

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

## Verify

```bash
curl http://localhost:8000/api/v1/health
python -m compileall app
docker compose config
node --check browser-extension/popup.js
node --check browser-extension/report.js
```

## First Scan

```bash
curl -X POST http://localhost:8000/api/v1/basic-scans \
  -H "Content-Type: application/json" \
  -d '{
    "repository_url": "https://github.com/octocat/Hello-World",
    "branch": "main"
  }'
```

For the current request/response flow and route list, use [README.md](README.md) and [API.md](API.md).
