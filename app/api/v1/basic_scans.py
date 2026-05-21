"""No-auth, in-memory scan routes for the foundation product flow."""
import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.basic_scanner_service import BasicScannerError, run_basic_scan
from app.services.github_service import GitHubError, list_public_branches, parse_github_repository


router = APIRouter(prefix="/basic-scans", tags=["basic-scans"])
SCAN_RESULTS: dict[str, dict[str, Any]] = {}


class BasicScanRequest(BaseModel):
    repository_url: str = Field(..., description="Public GitHub repository URL")
    branch: str = Field(default="main", description="Branch to scan")


@router.post("", status_code=201)
async def create_basic_scan(request: BasicScanRequest) -> dict[str, Any]:
    """Validate, fetch, scan, score, and store a public GitHub repository report."""
    try:
        scan = await asyncio.to_thread(run_basic_scan, request.repository_url, request.branch)
    except (BasicScannerError, GitHubError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    SCAN_RESULTS[scan["id"]] = scan
    return scan


@router.get("")
async def list_basic_scans(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[dict[str, Any]]:
    """List in-memory foundation scan results."""
    scans = sorted(SCAN_RESULTS.values(), key=lambda scan: scan["created_at"], reverse=True)
    return scans[skip:skip + limit]


@router.get("/branches")
async def list_basic_scan_branches(repository_url: str = Query(...)) -> list[dict[str, str]]:
    """Return branches for a public GitHub repository URL without requiring auth."""
    repository = parse_github_repository(repository_url)
    if not repository:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid public GitHub repository URL like https://github.com/owner/repo"
        )

    try:
        return await asyncio.to_thread(list_public_branches, repository.owner, repository.repo)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{scan_id}")
async def get_basic_scan(scan_id: str) -> dict[str, Any]:
    """Return one in-memory foundation scan report."""
    scan = SCAN_RESULTS.get(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/{scan_id}/status")
async def get_basic_scan_status(scan_id: str) -> dict[str, Any]:
    """Return completed status for a foundation scan."""
    scan = SCAN_RESULTS.get(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {
        "scan_id": scan_id,
        "status": scan["status"],
        "progress": scan["progress"],
        "files_processed": scan["files_processed"],
        "files_total": scan["files_total"],
        "current_file": None,
        "created_at": scan["created_at"],
        "started_at": scan["started_at"],
        "completed_at": scan["completed_at"],
        "error_message": None,
    }
