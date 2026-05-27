# Setup Guide

The project has been simplified to a single API process plus MongoDB.

## What Runs

- `frontend`
- `api`
- `mongodb`

There is no separate worker, Redis queue, or monitoring stack in the default setup.

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

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

## Verify

```bash
curl http://localhost:8000/api/v1/health
python -m compileall app
docker compose config
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

For the current request/response flow and route list, use [README.md](/home/sourabh/code-analytics-platform/README.md) and [API.md](/home/sourabh/code-analytics-platform/API.md).
