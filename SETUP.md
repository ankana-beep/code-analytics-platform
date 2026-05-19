# Code Analytics Platform - Quick Setup Instructions

## What You Got

A complete, production-ready distributed code analytics platform with:
- FastAPI backend with async architecture
- MongoDB for persistent storage
- Redis-based job queue
- Background worker pool
- WebSocket real-time updates
- Prometheus metrics
- Docker Compose orchestration

## File Structure

```
code-analytics-platform/
├── app/                    # Application code
│   ├── api/v1/            # API endpoints (scans, health, websocket)
│   ├── core/              # Config, database, redis, metrics
│   ├── domain/            # Domain models (Pydantic)
│   ├── services/          # Scanner service (business logic)
│   ├── repositories/      # Data access layer (MongoDB)
│   ├── workers/           # Background worker implementation
│   ├── analyzers/         # Code analyzers (Python AST-based)
│   └── main.py           # FastAPI application
├── docker/                # Docker configurations
├── docker-compose.yml     # Service orchestration
├── Dockerfile            # API service image
├── requirements.txt      # Python dependencies
├── Makefile             # Convenience commands
├── start.sh             # Quick start script
├── example_client.py    # Python client example
├── README.md            # Full documentation
├── API.md              # API documentation
└── DEPLOYMENT.md       # Deployment guide
```

## How to Run

### Option 1: Quick Start (Recommended)
```bash
cd code-analytics-platform
./start.sh
```

### Option 2: Manual Start
```bash
cd code-analytics-platform
cp .env.example .env
docker-compose up -d
```

### Option 3: With Monitoring
```bash
cd code-analytics-platform
docker-compose --profile monitoring up -d
```

## Verify Installation

```bash
# Check services
docker-compose ps

# Check health
curl http://localhost:8000/api/v1/health

# View API docs
open http://localhost:8000/docs
```

## Run Your First Scan

1. **Prepare a repository to scan:**
```bash
mkdir -p repositories
git clone https://github.com/your/repo repositories/my-project
```

2. **Create a scan via API:**
```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H 'Content-Type: application/json' \
  -d '{
    "repository_path": "/repositories/my-project",
    "branch": "main"
  }'
```

3. **Get scan results:**
```bash
# Replace SCAN_ID with the id from step 2
curl http://localhost:8000/api/v1/scans/SCAN_ID
```

## Using the Python Client

```bash
cd code-analytics-platform

# Edit example_client.py to set your repository path
python example_client.py
```

## Useful Commands

```bash
# View logs
make logs                 # All services
make logs-api            # API only
make logs-worker         # Workers only

# Scale workers
make scale-workers N=5   # Scale to 5 workers

# Access services
make db-shell            # MongoDB shell
make redis-cli           # Redis CLI

# Stop services
make down

# Clean everything
make clean
```

## Access Points

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/v1/health
- **Metrics**: http://localhost:8000/api/v1/metrics
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379
- **Prometheus**: http://localhost:9090 (with monitoring profile)
- **Grafana**: http://localhost:3000 (with monitoring profile)

## Architecture Highlights

### Async Everything
- Motor async MongoDB driver
- Redis async operations
- asyncio-based worker pool
- FastAPI async endpoints

### Bounded Concurrency
- asyncio.Semaphore limits concurrent operations
- Prevents memory exhaustion
- Configurable via SCAN_CONCURRENCY_LIMIT

### Producer-Consumer Pipeline
- Queue-based file processing
- Worker pool consumes from shared queue
- Efficient resource utilization

### Incremental Scanning
- File hash-based change detection
- Skip unchanged files
- Faster subsequent scans

### Real-time Updates
- WebSocket progress streaming
- Redis pub/sub for scalability
- Per-scan progress channels

### Clean Architecture
- Separated concerns (routers → services → repositories)
- Plugin-based analyzer architecture
- Easy to extend with new file types

## Performance Tuning

### Scale Workers
```bash
docker-compose up -d --scale worker=10
```

### Tune Concurrency
Edit `.env`:
```
WORKER_CONCURRENCY=20          # Files per worker
SCAN_CONCURRENCY_LIMIT=100     # Max analyzers
WORKER_POOL_SIZE=8             # Workers per container
```

### Optimize Database
```bash
# MongoDB indexes are created automatically
# For large datasets, consider sharding
```

## Troubleshooting

### Services won't start
```bash
docker-compose down -v
docker-compose up -d
```

### Scans stuck in queue
```bash
# Check worker logs
make logs-worker

# Check queue length
docker-compose exec redis redis-cli LLEN scan_jobs
```

### Out of memory
```bash
# Reduce concurrency in .env
SCAN_CONCURRENCY_LIMIT=25
WORKER_CONCURRENCY=5

# Restart services
docker-compose restart
```

## Production Deployment

See `DEPLOYMENT.md` for:
- Kubernetes deployment
- High availability setup
- Security hardening
- Backup strategies
- Monitoring setup

## Next Steps

1. ✅ Extract the zip file
2. ✅ Run `./start.sh`
3. ✅ Scan your first repository
4. ✅ Explore the API docs
5. ✅ Scale workers as needed
6. ✅ Set up monitoring
7. ✅ Deploy to production

## Support Files

- **README.md**: Comprehensive documentation
- **API.md**: Complete API reference
- **DEPLOYMENT.md**: Production deployment guide
- **example_client.py**: Python client implementation

Enjoy your production-grade code analytics platform! 🚀
