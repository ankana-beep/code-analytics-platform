"""Database-backed scan routes for public and authenticated GitHub repositories."""
import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field

from app.core.auth import get_optional_current_user
from app.core.database import mongodb_manager
from app.core.logging import logger
from app.domain.models import UserProfile
from app.services.basic_scanner_service import BasicScannerError, run_basic_scan
from app.services.github_service import GitHubError, list_repository_branches, parse_github_repository
from app.services.user_service import get_github_access_token


router = APIRouter(prefix="/basic-scans", tags=["basic-scans"])
SCAN_RESULTS: dict[str, dict[str, Any]] = {}


class BasicScanRequest(BaseModel):
    repository_url: str = Field(..., description="GitHub repository URL")
    branch: str = Field(default="main", description="Branch to scan")


def _get_basic_scans_collection() -> AsyncIOMotorCollection | None:
    """Return the MongoDB collection when Mongo is available."""
    try:
        return mongodb_manager.get_database().basic_scans
    except RuntimeError:
        return None


async def _save_basic_scan(scan: dict[str, Any]) -> None:
    collection = _get_basic_scans_collection()
    if collection is None:
        SCAN_RESULTS[scan["id"]] = scan
        return

    document = {**scan, "_id": scan["id"]}
    await collection.replace_one({"_id": scan["id"]}, document, upsert=True)
    SCAN_RESULTS[scan["id"]] = scan


async def _load_basic_scan(scan_id: str) -> dict[str, Any] | None:
    collection = _get_basic_scans_collection()
    if collection is not None:
        document = await collection.find_one({"_id": scan_id})
        if document:
            document["_id"] = str(document["_id"])
            return document

    return SCAN_RESULTS.get(scan_id)


async def _github_token_for_user(user: UserProfile | None) -> str | None:
    """Return the user's GitHub token when the request is authenticated."""
    if user is None:
        return None
    return await get_github_access_token(user.github_id)


@router.post("", status_code=201)
async def create_basic_scan(
    request: BasicScanRequest,
    current_user: UserProfile | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """Validate, fetch, scan, score, and store a GitHub repository report.

    Anonymous requests can scan public repositories. Authenticated requests use
    the caller's GitHub OAuth token, allowing private repositories that GitHub
    says the caller can access.
    """
    try:
        github_token = await _github_token_for_user(current_user)
        scan = await asyncio.to_thread(
            run_basic_scan,
            request.repository_url,
            request.branch,
            github_token,
        )
    except (BasicScannerError, GitHubError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        await _save_basic_scan(scan)
    except Exception as exc:
        logger.error("Failed to save basic scan", extra={"scan_id": scan["id"], "error": str(exc)})
        raise HTTPException(status_code=500, detail="Scan completed, but saving it to the database failed") from exc

    return scan


@router.get("")
async def list_basic_scans(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[dict[str, Any]]:
    """List persisted foundation scan results."""
    collection = _get_basic_scans_collection()
    if collection is not None:
        cursor = collection.find({}).sort("created_at", -1).skip(skip).limit(limit)
        scans = []
        async for scan in cursor:
            scan["_id"] = str(scan["_id"])
            scans.append(scan)
        return scans

    scans = sorted(SCAN_RESULTS.values(), key=lambda scan: scan["created_at"], reverse=True)
    return scans[skip:skip + limit]


@router.get("/branches")
async def list_basic_scan_branches(
    repository_url: str = Query(...),
    current_user: UserProfile | None = Depends(get_optional_current_user),
) -> list[dict[str, str]]:
    """Return branches for a public repository or authenticated private repository."""
    repository = parse_github_repository(repository_url)
    if not repository:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid GitHub repository URL like https://github.com/owner/repo"
        )

    try:
        github_token = await _github_token_for_user(current_user)
        return await asyncio.to_thread(
            list_repository_branches,
            repository.owner,
            repository.repo,
            github_token,
        )
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{scan_id}")
async def get_basic_scan(scan_id: str) -> dict[str, Any]:
    """Return one persisted foundation scan report."""
    scan = await _load_basic_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.delete("/{scan_id}", status_code=204)
async def delete_basic_scan(scan_id: str) -> None:
    """Delete one persisted foundation scan report."""
    collection = _get_basic_scans_collection()
    deleted = False

    if collection is not None:
        result = await collection.delete_one({"_id": scan_id})
        deleted = result.deleted_count > 0

    if scan_id in SCAN_RESULTS:
        del SCAN_RESULTS[scan_id]
        deleted = True

    if not deleted:
        raise HTTPException(status_code=404, detail="Scan not found")


@router.get("/{scan_id}/status")
async def get_basic_scan_status(scan_id: str) -> dict[str, Any]:
    """Return completed status for a foundation scan."""
    scan = await _load_basic_scan(scan_id)
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
