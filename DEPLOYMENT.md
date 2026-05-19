# Deployment Guide - Code Analytics Platform

## Quick Start

### Local Development

1. **Clone and Setup**
```bash
cd code-analytics-platform
cp .env.example .env
./start.sh
```

2. **Verify Services**
```bash
curl http://localhost:8000/api/v1/health
```

3. **Run a Scan**
```bash
# Place your repository in ./repositories/
mkdir -p repositories
git clone <your-repo> repositories/my-project

# Create scan via API
curl -X POST http://localhost:8000/api/v1/scans \
  -H 'Content-Type: application/json' \
  -d '{"repository_path": "/repositories/my-project"}'
```

## Production Deployment

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ disk space

### Deployment Steps

1. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with production values
```

2. **Build Images**
```bash
docker-compose build --no-cache
```

3. **Start Services**
```bash
docker-compose up -d
```

4. **Scale Workers**
```bash
docker-compose up -d --scale worker=4
```

### Kubernetes Deployment

1. **Create ConfigMap**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: code-analytics-config
data:
  MONGODB_URL: "mongodb://mongodb-service:27017"
  REDIS_URL: "redis://redis-service:6379/0"
```

2. **Deploy API**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: code-analytics-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: code-analytics-api
  template:
    metadata:
      labels:
        app: code-analytics-api
    spec:
      containers:
      - name: api
        image: code-analytics-api:latest
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: code-analytics-config
```

3. **Deploy Workers**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: code-analytics-worker
spec:
  replicas: 5
  selector:
    matchLabels:
      app: code-analytics-worker
  template:
    metadata:
      labels:
        app: code-analytics-worker
    spec:
      containers:
      - name: worker
        image: code-analytics-worker:latest
        envFrom:
        - configMapRef:
            name: code-analytics-config
```

### Monitoring

#### Prometheus + Grafana
```bash
make monitoring
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

#### Key Metrics
- `scans_total` - Total scans by status
- `scan_duration_seconds` - Scan duration histogram
- `queue_length` - Current job queue length
- `active_workers` - Active worker count
- `http_request_duration_seconds` - API latency

### Scaling Strategy

#### Horizontal Scaling
```bash
# Scale API instances
docker-compose up -d --scale api=3

# Scale workers
docker-compose up -d --scale worker=10
```

#### Vertical Scaling
Edit `docker-compose.yml`:
```yaml
worker:
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 4G
```

### Performance Tuning

#### MongoDB Optimization
- Enable sharding for large datasets
- Create appropriate indexes
- Use read replicas

#### Redis Optimization
- Increase maxmemory for larger queues
- Enable AOF persistence for durability
- Use Redis Cluster for HA

#### Worker Tuning
- `WORKER_CONCURRENCY`: Files processed in parallel (default: 10)
- `SCAN_CONCURRENCY_LIMIT`: Max concurrent analyzers (default: 50)
- `WORKER_POOL_SIZE`: Workers per container (default: 4)

### Troubleshooting

#### Check Logs
```bash
make logs-api
make logs-worker
```

#### Database Connection Issues
```bash
docker-compose exec mongodb mongosh
docker-compose exec redis redis-cli
```

#### Queue Backlog
```bash
# Check queue length
docker-compose exec redis redis-cli LLEN scan_jobs

# Clear queue
docker-compose exec redis redis-cli DEL scan_jobs
```

### Backup and Recovery

#### MongoDB Backup
```bash
docker-compose exec mongodb mongodump \
  --out=/data/backup --db=code_analytics

docker cp code-analytics-mongodb:/data/backup ./backup
```

#### Restore
```bash
docker cp ./backup code-analytics-mongodb:/data/backup
docker-compose exec mongodb mongorestore \
  --db=code_analytics /data/backup/code_analytics
```

### Security Considerations

1. **Change default credentials**
2. **Enable authentication** on MongoDB and Redis
3. **Use TLS/SSL** for production
4. **Implement rate limiting** at load balancer
5. **Restrict network access** using firewall rules
6. **Regular security updates** for dependencies

### High Availability Setup

#### Load Balancer (Nginx)
```nginx
upstream api_backend {
    least_conn;
    server api-1:8000;
    server api-2:8000;
    server api-3:8000;
}

server {
    listen 80;
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### MongoDB Replica Set
```yaml
mongodb:
  image: mongo:7.0
  command: mongod --replSet rs0
```

#### Redis Sentinel
```yaml
redis-sentinel:
  image: redis:7-alpine
  command: redis-sentinel /etc/redis/sentinel.conf
```
