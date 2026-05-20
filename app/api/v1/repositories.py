"""Saved repository endpoints."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.core.redis import RedisManager, get_redis
from app.core.security import get_current_user
from app.domain.models import (
    SavedRepository,
    SavedRepositoryCreate,
    SavedRepositoryUpdate,
    Scan,
    ScanRequest,
    ScanResponse,
    ScanStatus,
    User
)
from app.repositories.saved_repository import SavedRepositoryRepository
from app.repositories.scan_repository import ScanRepository


router = APIRouter(prefix="/repositories", tags=["repositories"])


async def get_saved_repository_repository(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> SavedRepositoryRepository:
    return SavedRepositoryRepository(db)


async def get_scan_repository(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> ScanRepository:
    return ScanRepository(db)


@router.post("", response_model=SavedRepository, status_code=201)
async def create_saved_repository(
    request: SavedRepositoryCreate,
    current_user: User = Depends(get_current_user),
    repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository)
):
    saved_repository = SavedRepository(
        user_id=current_user.id or "",
        name=request.name,
        repository_path=request.repository_path,
        default_branch=request.default_branch,
        team_name=request.team_name,
        labels=request.labels,
        tags=request.tags
    )

    try:
        repository_id = await repositories.create(saved_repository)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Repository is already saved") from exc

    created = await repositories.get(repository_id, current_user.id or "")
    if not created:
        raise HTTPException(status_code=500, detail="Failed to load saved repository")
    return created


@router.get("", response_model=List[SavedRepository])
async def list_saved_repositories(
    team_name: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    label: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository)
):
    return await repositories.list(current_user.id or "", team_name=team_name, tag=tag, label=label)


@router.patch("/{repository_id}", response_model=SavedRepository)
async def update_saved_repository(
    repository_id: str,
    request: SavedRepositoryUpdate,
    current_user: User = Depends(get_current_user),
    repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository)
):
    updated = await repositories.update(
        repository_id,
        current_user.id or "",
        request.model_dump(exclude_unset=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Saved repository not found")

    saved_repository = await repositories.get(repository_id, current_user.id or "")
    if not saved_repository:
        raise HTTPException(status_code=404, detail="Saved repository not found")
    return saved_repository


@router.delete("/{repository_id}", status_code=204)
async def delete_saved_repository(
    repository_id: str,
    current_user: User = Depends(get_current_user),
    repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository)
):
    deleted = await repositories.delete(repository_id, current_user.id or "")
    if not deleted:
        raise HTTPException(status_code=404, detail="Saved repository not found")


@router.get("/{repository_id}/scans", response_model=List[Scan])
async def list_saved_repository_scans(
    repository_id: str,
    branch: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository),
    scans: ScanRepository = Depends(get_scan_repository)
):
    saved_repository = await repositories.get(repository_id, current_user.id or "")
    if not saved_repository:
        raise HTTPException(status_code=404, detail="Saved repository not found")

    return await scans.list_scans(
        skip=0,
        limit=100,
        repository_path=saved_repository.repository_path,
        branch=branch,
        user_id=current_user.id,
        saved_repository_id=repository_id
    )


@router.post("/{repository_id}/scans", response_model=ScanResponse, status_code=201)
async def scan_saved_repository(
    repository_id: str,
    request: ScanRequest,
    current_user: User = Depends(get_current_user),
    repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository),
    scans: ScanRepository = Depends(get_scan_repository),
    redis: RedisManager = Depends(get_redis)
):
    saved_repository = await repositories.get(repository_id, current_user.id or "")
    if not saved_repository:
        raise HTTPException(status_code=404, detail="Saved repository not found")

    branch = request.branch or saved_repository.default_branch
    scan = Scan(
        user_id=current_user.id,
        saved_repository_id=repository_id,
        repository_path=saved_repository.repository_path,
        branch=branch,
        incremental=request.incremental,
        status=ScanStatus.QUEUED
    )
    scan_id = await scans.create_scan(scan)
    job_id = await redis.enqueue_job({
        "scan_id": scan_id,
        "repository_path": saved_repository.repository_path,
        "branch": branch,
        "incremental": request.incremental,
        "analyzers": request.analyzers or []
    })
    return ScanResponse(
        scan_id=scan_id,
        job_id=job_id,
        status=ScanStatus.QUEUED,
        message="Saved repository scan initiated"
    )
