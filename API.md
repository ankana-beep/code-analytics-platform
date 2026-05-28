# API Documentation

Base URL: `http://localhost:8000/api/v1`

This project currently exposes a small no-auth API for public GitHub repository scanning.

## Health

### `GET /health`

Returns application and MongoDB health.

Example response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "mongodb": "healthy"
  }
}
```

### `GET /ready`

Readiness probe.

### `GET /live`

Liveness probe.

### `GET /info`

Basic application metadata.

## Basic Scans

### `POST /basic-scans`

Create a scan for a public GitHub repository branch.

Request:

```json
{
  "repository_url": "https://github.com/octocat/Hello-World",
  "branch": "main"
}
```

Response:

```json
{
  "id": "scan-id",
  "repository_name": "octocat/Hello-World",
  "repository_path": "https://github.com/octocat/Hello-World",
  "branch": "main",
  "status": "completed",
  "progress": 100
}
```

### `GET /basic-scans`

List stored scans.

Query params:

- `skip`
- `limit`

### `GET /basic-scans/{scan_id}`

Fetch one completed scan.

### `GET /basic-scans/{scan_id}/status`

Fetch summarized status for one scan.

### `DELETE /basic-scans/{scan_id}`

Delete one scan.

### `GET /basic-scans/branches?repository_url=...`

List public branches for a repository URL.

## GitHub Metadata

### `GET /github/users/{username}/repositories`

List public repositories for a GitHub user.

### `GET /github/repositories/{owner}/{repo}/branches`

List public branches for a repository.
