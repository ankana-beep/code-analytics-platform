# API Documentation - Code Analytics Platform

Base URL: `http://localhost:8000/api/v1`

## Authentication
Currently no authentication required. Add API keys or JWT tokens for production.

## Endpoints

### Health & Monitoring

#### GET /health
Get application health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00",
  "services": {
    "mongodb": "healthy",
    "redis": "healthy"
  }
}
```

#### GET /metrics
Prometheus metrics endpoint.

**Response:** Prometheus text format

---

### Scans

#### POST /scans
Create a new repository scan.

**Request:**
```json
{
  "repository_path": "/repositories/my-project",
  "branch": "main",
  "incremental": false,
  "analyzers": ["python"]
}
```

**Response:**
```json
{
  "scan_id": "507f1f77bcf86cd799439011",
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "message": "Scan initiated successfully"
}
```

#### GET /scans/{scan_id}
Get scan details.

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "repository_path": "/repositories/my-project",
  "branch": "main",
  "status": "completed",
  "progress": 100.0,
  "files_processed": 150,
  "files_total": 150,
  "metrics": {
    "scan_id": "507f1f77bcf86cd799439011",
    "repository_path": "/repositories/my-project",
    "total_files": 150,
    "total_lines_of_code": 15000,
    "total_comment_lines": 2500,
    "total_blank_lines": 1000,
    "docstring_coverage": 75.5,
    "todo_count": 10,
    "fixme_count": 5,
    "complexity_metrics": {
      "avg_cyclomatic_complexity": 3.2,
      "max_cyclomatic_complexity": 15,
      "avg_cognitive_complexity": 4.1,
      "max_cognitive_complexity": 20
    },
    "test_metrics": {
      "total_test_files": 25,
      "tests_per_module": 0.16
    }
  },
  "created_at": "2024-01-01T00:00:00",
  "completed_at": "2024-01-01T00:05:00"
}
```

#### GET /scans
List scans with pagination.

**Query Parameters:**
- `skip` (int): Records to skip (default: 0)
- `limit` (int): Max records (default: 10, max: 100)
- `repository_path` (str): Filter by repository
- `status` (str): Filter by status (queued, processing, completed, failed)

**Response:**
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "repository_path": "/repositories/my-project",
    "status": "completed",
    "progress": 100.0,
    "created_at": "2024-01-01T00:00:00"
  }
]
```

#### GET /scans/{scan_id}/status
Get scan status and progress.

**Response:**
```json
{
  "scan_id": "507f1f77bcf86cd799439011",
  "status": "processing",
  "progress": 45.5,
  "files_processed": 68,
  "files_total": 150,
  "current_file": "/repositories/my-project/src/main.py",
  "created_at": "2024-01-01T00:00:00",
  "started_at": "2024-01-01T00:00:05"
}
```

#### GET /scans/{scan_id}/files
Get file-level metrics.

**Query Parameters:**
- `skip` (int): Records to skip (default: 0)
- `limit` (int): Max records (default: 100, max: 1000)

**Response:**
```json
[
  {
    "file_path": "/repositories/my-project/src/main.py",
    "file_type": "python",
    "file_hash": "a1b2c3d4...",
    "file_size": 5000,
    "lines_of_code": 150,
    "comment_lines": 25,
    "blank_lines": 10,
    "docstring_coverage": 80.0,
    "cyclomatic_complexity": 5,
    "cognitive_complexity": 7,
    "maintainability_index": 75.5,
    "todo_count": 2,
    "fixme_count": 1,
    "has_tests": true,
    "dependencies": ["os", "sys", "fastapi"],
    "functions": 10,
    "classes": 2,
    "methods": 8
  }
]
```

#### POST /scans/{scan_id}/retry
Retry a failed scan.

**Response:**
```json
{
  "scan_id": "507f1f77bcf86cd799439012",
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567891",
  "status": "queued",
  "message": "Scan retry initiated"
}
```

#### DELETE /scans/{scan_id}
Cancel a running scan.

**Response:** 204 No Content

---

### WebSocket

#### WS /ws/scans/{scan_id}/progress
Real-time scan progress updates.

**Connect:**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/scans/{scan_id}/progress');
```

**Messages:**
```json
{
  "type": "progress",
  "data": {
    "scan_id": "507f1f77bcf86cd799439011",
    "progress": 45.5,
    "files_processed": 68,
    "files_total": 150,
    "current_file": "/repositories/my-project/src/main.py"
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "detail": "Invalid request parameters"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "detail": "Scan not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "detail": "An unexpected error occurred"
}
```

---

## Rate Limiting

Default: 100 requests/minute per IP
Burst: 200 requests

Headers:
- `X-RateLimit-Limit`: Rate limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

---

## Examples

### cURL

**Create Scan:**
```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H 'Content-Type: application/json' \
  -d '{
    "repository_path": "/repositories/my-project",
    "branch": "main"
  }'
```

**Get Scan Status:**
```bash
curl http://localhost:8000/api/v1/scans/{scan_id}/status
```

### Python

```python
import requests

# Create scan
response = requests.post(
    'http://localhost:8000/api/v1/scans',
    json={
        'repository_path': '/repositories/my-project',
        'branch': 'main'
    }
)
scan = response.json()

# Get results
response = requests.get(
    f"http://localhost:8000/api/v1/scans/{scan['scan_id']}"
)
results = response.json()
```

### JavaScript

```javascript
// Create scan
const response = await fetch('http://localhost:8000/api/v1/scans', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    repository_path: '/repositories/my-project',
    branch: 'main'
  })
});
const scan = await response.json();

// WebSocket for progress
const ws = new WebSocket(`ws://localhost:8000/ws/scans/${scan.scan_id}/progress`);
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`Progress: ${data.data.progress}%`);
};
```
