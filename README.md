# Code Analytics Platform

Production-grade distributed code analytics platform using FastAPI, MongoDB, Redis, Docker, and a React frontend.

## Features

- Async FastAPI backend with Motor MongoDB driver
- Redis job queue with background workers
- Public GitHub repository scanning by username, profile URL, or repository URL
- Branch discovery before scanning
- Repository branch archive download without cloning public repos
- Real-time scan progress with WebSocket updates
- Dashboard with scan pagination and aggregate metrics
- Detailed metrics for code size, comments, complexity, maintainability, dependencies, tests, folders, and issues
- Prometheus metrics for observability
- Dockerized services for local and production-style runs

## Quick Start

```bash
# Start all services
./start.sh

# Or manually
docker-compose up -d

# View logs
make logs

# Scale workers
make scale-workers N=5
```

Access:

- Frontend Dashboard: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

For local frontend development:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Development frontend URL:

```text
http://127.0.0.1:5173/
```

## GitHub Scan Flow

The frontend scan flow is GitHub-first.

1. Open the frontend dashboard.
2. Go to `New Scan`.
3. Enter one of these public GitHub inputs:
   - Username: `octocat`
   - Profile URL: `https://github.com/octocat`
   - Repository URL: `https://github.com/owner/repo`
4. Click `Find Branches`.
5. If you entered a username or profile URL, choose one public repository from the list.
6. Choose a branch from the branch dropdown.
7. Click `Start Scan`.
8. Watch real-time scan progress.
9. Click `View Results` after completion.

Only public GitHub users and repositories are supported. Private or nonexistent resources return a validation error.

## What Gets Analyzed

### File-Level Metrics

- Lines of code
- Comment lines
- Blank lines
- File size
- Docstring coverage
- Cyclomatic complexity
- Cognitive complexity
- Maintainability index
- TODO and FIXME markers
- Test file detection
- Dependencies

### Project-Level Metrics

- Total files
- Total lines of code
- Total comments and blank lines
- File type distribution
- Folder statistics
- Dependency usage
- Duplicate files
- Test metrics
- Average and maximum complexity
- Maintainability score
- Scan duration

## API Usage

### List Public Repositories For A GitHub User

```bash
curl http://localhost:8000/api/v1/github/users/octocat/repositories
```

### List Branches For A Public GitHub Repository

```bash
curl http://localhost:8000/api/v1/github/repositories/octocat/Hello-World/branches
```

### Create Scan For A Public GitHub Repository

```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Content-Type: application/json" \
  -d '{
    "repository_path": "https://github.com/octocat/Hello-World",
    "branch": "main"
  }'
```

The backend downloads the selected public branch archive from GitHub and scans it without cloning the repository.

### Get Scan Results

```bash
curl http://localhost:8000/api/v1/scans/{scan_id}
```

### WebSocket Progress

```javascript
const ws = new WebSocket("ws://localhost:8000/ws/scans/{scan_id}/progress");
ws.onmessage = (event) => console.log(JSON.parse(event.data));
```

## Architecture

```text
Client / React Frontend
        |
        v
FastAPI API
        |
        +--> GitHub public metadata and branch lookup
        |
        +--> MongoDB stores scans and metrics
        |
        +--> Redis queues scan jobs
                  |
                  v
              Worker Pool
                  |
                  +--> Downloads public GitHub branch archive
                  +--> Analyzes files
                  +--> Stores metrics
                  +--> Publishes WebSocket progress
```

## Configuration

Create or edit `.env` from `.env.example`.

```bash
# Worker settings
WORKER_POOL_SIZE=4
WORKER_CONCURRENCY=10

# Scanning
SCAN_CONCURRENCY_LIMIT=50
SCAN_MAX_FILE_SIZE=10485760

# Cache
CACHE_ENABLED=true
CACHE_TTL=3600
```

## Development

### Project Structure

```text
app/
  api/v1/           API endpoints
  core/             Configuration, DB, Redis, metrics
  domain/           Pydantic domain models
  services/         Business logic
  repositories/     Data access layer
  workers/          Background workers
  analyzers/        Code analyzers
  main.py           FastAPI application

frontend/
  src/pages/        React pages
  src/services/     API client
  src/types/        TypeScript contracts
```

### Backend Check

```bash
python -m compileall app
```

### Frontend Build

```bash
cd frontend
npm install
npm run build
```

## Pushing This Project To GitHub

Use these steps when you are ready to publish the project to your GitHub account.

### 1. Check Whether This Folder Is Already A Git Repo

```bash
git status
```

If you see `fatal: not a git repository`, initialize git:

```bash
git init
```

### 2. Add A `.gitignore`

Make sure generated files and local secrets are ignored before committing.

Recommended entries:

```gitignore
.env
__pycache__/
*.pyc
.pytest_cache/
frontend/node_modules/
frontend/dist/
repositories/
```

### 3. Review Changes

```bash
git status
git diff
```

### 4. Stage Files

```bash
git add .
```

### 5. Commit

```bash
git commit -m "Add GitHub branch-based code scanning"
```

### 6. Create A GitHub Repository

1. Go to https://github.com/new
2. Enter a repository name.
3. Choose `Public` or `Private`.
4. Do not initialize with README, `.gitignore`, or license if this local project already has them.
5. Click `Create repository`.

### 7. Connect Local Repo To GitHub

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME`.

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

If `origin` already exists, update it:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

### 8. Push

```bash
git push -u origin main
```

### 9. Future Updates

After making more changes:

```bash
git status
git add .
git commit -m "Describe your change"
git push
```

## Troubleshooting

### Check Service Health

```bash
make logs-api
make logs-worker
docker-compose ps
```

### Database And Queue

```bash
make db-shell
make redis-cli
docker-compose exec redis redis-cli LLEN scan_jobs
```

### GitHub API Limits

The app uses unauthenticated public GitHub API requests. If GitHub rate limits the server, wait and try again later.

## Documentation

- [API Documentation](API.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Example Client](example_client.py)

## License

MIT License
