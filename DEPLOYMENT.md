# Deployment Guide

This deployment is intentionally simple:

- `api` runs the scan flow directly
- MongoDB Atlas or another external MongoDB stores finished scans
- `redis` is used only for AI summary caching and rate limiting
- The browser extension serves the report UI from `chrome-extension://.../report.html`

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

Make sure `.env` includes a valid `MONGODB_URL` for your Atlas cluster before starting the stack.

## Checks

```bash
docker compose ps
curl http://localhost:8000/api/v1/health
docker compose logs -f api
```

## Notes

- There is no frontend or worker service to scale separately.
- Redis is optional application support, but in Docker Compose it is included only for AI summary caching and rate limiting.
- Monitoring containers and compose resource limits were removed to keep the stack focused on the active feature set.
- If you need more throughput later, start by profiling the scan path before adding concurrency layers back in.
