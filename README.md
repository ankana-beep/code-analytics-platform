# Code Analytics Platform

Production-style code analytics platform for scanning public GitHub repositories, tracking repository quality over time, comparing scans, and exporting shareable reports.

The system uses a React frontend, FastAPI backend, MongoDB persistence, Redis-backed queues/sessions/cache, and scalable background workers.

## Core Features

- Email/password authentication with bcrypt password hashing
- JWT access tokens with Redis-backed sessions and token blacklist logout
- Public GitHub repository lookup by username, profile URL, or repository URL
- Branch discovery and branch/commit-ref scanning
- Redis job queue with background worker processing
- Real-time scan progress through WebSockets
- Responsive executive dashboard with search, filters, skeletons, empty states, and bulk actions
- Saved repositories per user with team grouping, labels, and tags
- Scan history by branch or commit ref
- Compare completed scans from the same repository
- Detailed code metrics for files, folders, complexity, maintainability, dependencies, tests, TODOs, and FIXMEs
- CSV and PDF scan exports
- Tokenized shareable public scan reports
- Prometheus metrics, health checks, Docker Compose, optional Grafana

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Recharts, Axios |
| API | FastAPI, Pydantic, Uvicorn |
| Auth | JWT, bcrypt, Redis sessions/token blacklist |
| Database | MongoDB with Motor async driver |
| Queue/Cache | Redis |
| Workers | Python background scan worker |
| Reports | CSV, ReportLab PDF |
| Observability | Prometheus metrics, health endpoints, optional Grafana |
| Deployment | Docker, Docker Compose |

## Architecture

```text
+---------------------------------------------------------------------+
|                            React Frontend                           |
|                                                                     |
|  AuthPage        Dashboard        Repositories       ScanDetail      |
|  Settings        NewScan          SharedReport       Timeline UI     |
+---------------+---------------------------+-------------------------+
                | REST API                  | WebSocket progress
                v                           v
+---------------------------------------------------------------------+
|                              FastAPI API                            |
|                                                                     |
|  /auth          login/register/me/logout                            |
|  /github        public GitHub metadata                              |
|  /repositories  saved repos, labels, tags, scan history             |
|  /scans         create/list/detail/delete/retry/compare             |
|  /reports       executive summary, CSV/PDF export, share links      |
|  /health        service health and readiness                        |
+---------------+--------------------+---------------------+----------+
                |                    |                     |
                v                    v                     v
+----------------------+  +----------------------+  +-----------------+
|       MongoDB        |  |        Redis         |  |  GitHub Public  |
|                      |  |                      |  |      API        |
| users                |  | scan_jobs queue      |  | users/repos     |
| scans                |  | sessions             |  | branches        |
| files                |  | token blacklist      |  | tarball archive |
| saved_repositories   |  | cache                |  +-----------------+
| metrics              |  | pub/sub progress     |
+----------------------+  +----------+-----------+
                                      |
                                      v
                         +--------------------------+
                         |      Worker Pool         |
                         |                          |
                         | downloads repo archive   |
                         | discovers supported files|
                         | runs analyzers           |
                         | stores metrics           |
                         | publishes progress       |
                         +--------------------------+
```

## Runtime Flow

### Authentication Flow

```text
Register/Login
   |
   +-- bcrypt hashes/verifies password
   |
   +-- FastAPI issues JWT access  token                                                                                                                                                                                                                                                                                                                   
   |
   +-- Redis stores token session by JWT id
   |
   +-- Frontend sends Authorization: Bearer <token>

Logout
   |
   +-- Redis deletes session
   +-- Redis blacklists JWT id until token expiry
```

### Scan Flow

```text
User selects GitHub repository + branch/ref
   |
   +-- FastAPI creates scan document in MongoDB
   +-- FastAPI enqueues job in Redis
   +-- Worker downloads GitHub tarball
   +-- Worker discovers and analyzes files
   +-- Worker stores file and aggregate metrics in MongoDB
   +-- Worker publishes progress over Redis/WebSocket
```

### Reporting Flow

```text
Completed scan
   |
   +-- Export CSV with summary + file metrics
   +-- Export PDF summary report
   +-- Create share token
   +-- Public /shared/:token page renders read-only report
```

## Quick Start

```bash
docker compose up --build
```

Access:

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

Default Grafana password in `docker-compose.yml` is `admin`.

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

Frontend development URL:

```text
http://127.0.0.1:5173
```

## Configuration

Create a local `.env` from `.env.example`.

Important settings:

```env
MONGODB_URL=mongodb://mongodb:27017
MONGODB_DATABASE=code_analytics
REDIS_URL=redis://redis:6379/0

JWT_SECRET_KEY=replace-with-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
SESSION_TTL=3600

CACHE_ENABLED=true
CACHE_TTL=3600

SCAN_MAX_FILE_SIZE=10485760
SCAN_CONCURRENCY_LIMIT=50
WORKER_POOL_SIZE=4
WORKER_CONCURRENCY=10
```

For production, replace `JWT_SECRET_KEY`, lock down `CORS_ORIGINS`, and do not use default secrets.

## Main Frontend Screens

- `AuthPage`: login/register
- `Dashboard`: executive summary, recent scans, filters, bulk delete, charts
- `NewScan`: GitHub lookup, branch discovery, scan start, progress timeline
- `Repositories`: saved repositories, team field, labels/tags, scan history, scan comparison
- `ScanDetail`: metrics, charts, file details, CSV/PDF export, share report
- `SharedReport`: public read-only scan report by token
- `Settings`: user profile settings

## API Overview

Most API routes require:

```http
Authorization: Bearer <jwt>
```

### Auth

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Create account and return token |
| POST | `/api/v1/auth/login` | Login and return token |
| POST | `/api/v1/auth/logout` | Revoke current session |
| GET | `/api/v1/auth/me` | Current user profile |
| PATCH | `/api/v1/auth/me` | Update profile |

### GitHub Metadata

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/github/users/{username}/repositories` | List public repositories |
| GET | `/api/v1/github/repositories/{owner}/{repo}/branches` | List public branches |

### Scans

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/scans` | Create scan |
| GET | `/api/v1/scans` | List scans with filters |
| GET | `/api/v1/scans/{scan_id}` | Get scan detail |
| GET | `/api/v1/scans/{scan_id}/status` | Get scan progress/status |
| GET | `/api/v1/scans/{scan_id}/files` | List file metrics |
| GET | `/api/v1/scans/compare` | Compare two completed scans |
| DELETE | `/api/v1/scans/{scan_id}` | Delete scan and metrics |
| POST | `/api/v1/scans/{scan_id}/retry` | Retry failed scan |

### Saved Repositories

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/repositories` | Save repository |
| GET | `/api/v1/repositories` | List saved repositories |
| PATCH | `/api/v1/repositories/{repository_id}` | Update labels/tags/team/default branch |
| DELETE | `/api/v1/repositories/{repository_id}` | Delete saved repository |
| GET | `/api/v1/repositories/{repository_id}/scans` | Branch/ref scan history |
| POST | `/api/v1/repositories/{repository_id}/scans` | Start scan for saved repo |

### Reports

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/reports/executive-summary` | Dashboard summary |
| GET | `/api/v1/reports/scans/{scan_id}/export.csv` | CSV export |
| GET | `/api/v1/reports/scans/{scan_id}/export.pdf` | PDF export |
| POST | `/api/v1/reports/scans/{scan_id}/share` | Create share token |
| GET | `/api/v1/reports/share/{share_token}` | Public shared report data |

## Example API Calls

Register:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123","full_name":"Dev User"}'
```

Create a scan:

```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "repository_path": "https://github.com/octocat/Hello-World",
    "branch": "main"
  }'
```

Compare scans:

```bash
curl "http://localhost:8000/api/v1/scans/compare?base_scan_id=<base>&target_scan_id=<target>" \
  -H "Authorization: Bearer <token>"
```

Export PDF:

```bash
curl -L http://localhost:8000/api/v1/reports/scans/<scan_id>/export.pdf \
  -H "Authorization: Bearer <token>" \
  -o scan-report.pdf
```

## What Gets Analyzed

File-level:

- Lines of code, comments, blanks, file size
- Docstring coverage
- Cyclomatic and cognitive complexity
- Maintainability index
- TODO and FIXME markers
- Dependency references
- Test file detection

Project-level:

- File count and LOC totals
- File type distribution
- Folder statistics
- Dependency usage
- Duplicate file detection
- Test metrics
- Average and maximum complexity
- Maintainability score
- Scan duration

Supported file extensions are configured in `app/core/config.py`.

## Project Structure

```text
app/
  api/v1/
    auth.py             Auth endpoints
    github.py           GitHub metadata endpoints
    repositories.py     Saved repository endpoints
    reports.py          Export/share/summary endpoints
    scans.py            Scan CRUD, status, compare
    websocket.py        Scan progress WebSocket
  analyzers/            Python, JavaScript, config analyzers
  core/                 Config, database, Redis, security, metrics
  domain/models.py      Pydantic domain models
  repositories/         MongoDB data access
  services/             GitHub and scanning services
  workers/              Background scan worker
  main.py               FastAPI app composition

frontend/src/
  components/           Shared UI components
  hooks/                WebSocket hook
  pages/                App screens
  services/api.ts       Typed API client
  types/index.ts        TypeScript contracts
  App.tsx               Routing, theme, auth gate
```

## Data Model Overview

MongoDB collections:

- `users`: account records, password hashes, profile data
- `scans`: scan metadata, status, aggregate metrics, share token
- `files`: file-level metrics for each scan
- `metrics`: reserved/indexed metrics collection
- `saved_repositories`: user-owned repository records with labels/tags/team

Redis responsibilities:

- `scan_jobs`: worker queue
- `session:{jti}`: active auth sessions
- `token_blacklist:{jti}`: revoked JWT ids
- `cache:*`: scan cache entries
- `scan:{scan_id}:progress`: pub/sub progress channel

## Verification

Backend syntax check:

```bash
python -m compileall app
```

Frontend production build:

```bash
cd frontend
npm run build
```

Docker Compose validation:

```bash
docker compose config
```

## Operations

Useful commands:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose exec redis redis-cli LLEN scan_jobs
docker compose exec mongodb mongosh code_analytics
```

Scale workers:

```bash
docker compose up --scale worker=4
```

## Limitations And Next Steps

Current limitations:

- GitHub scanning currently targets public repositories.
- Team support is a grouping field, not full team membership/RBAC.
- Shared reports are token-based and do not yet expire automatically.
- The dashboard loads the most recent 100 scans for summaries.

Good production next steps:

- Refresh token rotation
- Password reset and email verification
- Role-based access control
- Expiring share links
- Private repository access tokens
- CI/webhook-triggered scans
- Database migrations
- Sentry or another error tracking backend

## Documentation

- [API Documentation](API.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Setup Guide](SETUP.md)
- [Example Client](example_client.py)

## License

MIT License
