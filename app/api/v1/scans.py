"""
Scan API router with CRUD operations and pagination.
Implements API versioning, filtering, and caching.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import JSONResponse

from app.domain.models import (
    ScanRequest, ScanResponse, Scan, ScanStatus,
    FileMetrics, ScanComparison, ScanComparisonMetric, User
)
from app.core.security import get_current_user
from app.core.database import get_database
from app.core.redis import get_redis, RedisManager
from app.repositories.scan_repository import ScanRepository
from app.repositories.saved_repository import SavedRepositoryRepository
from app.core.logging import logger
from motor.motor_asyncio import AsyncIOMotorDatabase
import json
import hashlib


router = APIRouter(prefix="/scans", tags=["scans"], dependencies=[Depends(get_current_user)])


async def get_scan_repository(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> ScanRepository:
    """Dependency injection for scan repository."""
    return ScanRepository(db)


async def get_saved_repository_repository(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> SavedRepositoryRepository:
    """Dependency injection for saved repository repository."""
    return SavedRepositoryRepository(db)


def metric_delta(metric: str, base_value: float, target_value: float) -> ScanComparisonMetric:
    delta = target_value - base_value
    delta_percent = (delta / base_value * 100) if base_value else None
    return ScanComparisonMetric(
        metric=metric,
        base_value=base_value,
        target_value=target_value,
        delta=delta,
        delta_percent=delta_percent
    )


@router.post("", response_model=ScanResponse, status_code=201)
async def create_scan(
    request: ScanRequest,
    repository: ScanRepository = Depends(get_scan_repository),
    saved_repositories: SavedRepositoryRepository = Depends(get_saved_repository_repository),
    current_user: User = Depends(get_current_user),
    redis: RedisManager = Depends(get_redis)
):
    """
    Initiate a new repository scan.
    
    Creates a scan record and enqueues a job for background processing.
    Returns immediately with scan and job IDs for tracking.
    
    Args:
        request: Scan request parameters
        repository: Scan repository
        redis: Redis manager
        
    Returns:
        Scan response with scan_id and job_id
    """
    try:
        saved_repository = None
        saved_repository_id = request.saved_repository_id
        if saved_repository_id:
            saved_repository = await saved_repositories.get(saved_repository_id, current_user.id or "")
            if not saved_repository:
                raise HTTPException(status_code=404, detail="Saved repository not found")
        else:
            saved_repository = await saved_repositories.get_by_path(request.repository_path, current_user.id or "")
            saved_repository_id = saved_repository.id if saved_repository else None

        repository_path = saved_repository.repository_path if saved_repository else request.repository_path
        branch = request.branch or (saved_repository.default_branch if saved_repository else "main")

        # Check cache for recent scan
        cache_key = f"{current_user.id}:{repository_path}:{branch}"
        cached = await redis.cache_get(cache_key)
        
        if cached:
            cached_data = json.loads(cached)
            logger.info(f"Returning cached scan: {cached_data['scan_id']}")
            
            return ScanResponse(
                scan_id=cached_data['scan_id'],
                job_id=cached_data['job_id'],
                status=ScanStatus.COMPLETED,
                message="Scan already completed (cached)"
            )
        
        # Create scan record
        scan = Scan(
            user_id=current_user.id,
            saved_repository_id=saved_repository_id,
            repository_path=repository_path,
            branch=branch,
            incremental=request.incremental,
            status=ScanStatus.QUEUED
        )
        
        scan_id = await repository.create_scan(scan)
        
        # Enqueue job
        job_id = await redis.enqueue_job({
            "scan_id": scan_id,
            "repository_path": repository_path,
            "branch": branch,
            "incremental": request.incremental,
            "analyzers": request.analyzers or []
        })
        
        logger.info(
            "Scan created and job enqueued",
            extra={
                "scan_id": scan_id,
                "job_id": job_id,
                "repository": repository_path
            }
        )
        
        return ScanResponse(
            scan_id=scan_id,
            job_id=job_id,
            status=ScanStatus.QUEUED,
            message="Scan initiated successfully"
        )
    
    except Exception as e:
        logger.error(f"Failed to create scan: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create scan")


@router.get("/compare", response_model=ScanComparison)
async def compare_scans(
    base_scan_id: str = Query(...),
    target_scan_id: str = Query(...),
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    """Compare two completed scans owned by the current user."""
    base_scan = await repository.get_scan(base_scan_id)
    target_scan = await repository.get_scan(target_scan_id)

    if not base_scan or not target_scan:
        raise HTTPException(status_code=404, detail="One or both scans were not found")

    if (base_scan.user_id and base_scan.user_id != current_user.id) or (target_scan.user_id and target_scan.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="One or both scans were not found")

    if base_scan.status != ScanStatus.COMPLETED or target_scan.status != ScanStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Can only compare completed scans")

    if not base_scan.metrics or not target_scan.metrics:
        raise HTTPException(status_code=400, detail="Both scans must include metrics")

    if base_scan.repository_path != target_scan.repository_path:
        raise HTTPException(status_code=400, detail="Scans must belong to the same repository")

    base_metrics = base_scan.metrics
    target_metrics = target_scan.metrics
    metrics = [
        metric_delta("Total files", base_metrics.total_files, target_metrics.total_files),
        metric_delta("Lines of code", base_metrics.total_lines_of_code, target_metrics.total_lines_of_code),
        metric_delta("Comment lines", base_metrics.total_comment_lines, target_metrics.total_comment_lines),
        metric_delta("Docstring coverage", base_metrics.docstring_coverage, target_metrics.docstring_coverage),
        metric_delta(
            "Avg cyclomatic complexity",
            base_metrics.complexity_metrics.avg_cyclomatic_complexity,
            target_metrics.complexity_metrics.avg_cyclomatic_complexity
        ),
        metric_delta(
            "Maintainability",
            base_metrics.complexity_metrics.avg_maintainability_index,
            target_metrics.complexity_metrics.avg_maintainability_index
        ),
        metric_delta("TODOs", base_metrics.todo_count, target_metrics.todo_count),
        metric_delta("FIXMEs", base_metrics.fixme_count, target_metrics.fixme_count),
        metric_delta("Dependencies", len(base_metrics.dependencies), len(target_metrics.dependencies)),
        metric_delta("Scan duration", base_metrics.scan_duration, target_metrics.scan_duration),
    ]

    return ScanComparison(
        base_scan_id=base_scan_id,
        target_scan_id=target_scan_id,
        repository_path=base_scan.repository_path,
        base_branch=base_scan.branch,
        target_branch=target_scan.branch,
        metrics=metrics
    )


@router.get("/{scan_id}", response_model=Scan)
async def get_scan(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    """
    Get scan details by ID.
    
    Args:
        scan_id: Scan identifier
        repository: Scan repository
        
    Returns:
        Scan object with full details
    """
    scan = await repository.get_scan(scan_id)
    
    if not scan or (scan.user_id and scan.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return scan


@router.get("", response_model=List[Scan])
async def list_scans(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(10, ge=1, le=100, description="Maximum records to return"),
    repository_path: Optional[str] = Query(None, description="Filter by repository path"),
    status: Optional[ScanStatus] = Query(None, description="Filter by status"),
    branch: Optional[str] = Query(None, description="Filter by branch"),
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    """
    List scans with pagination and filtering.
    
    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        repository_path: Optional repository path filter
        status: Optional status filter
        repository: Scan repository
        
    Returns:
        List of scans
    """
    scans = await repository.list_scans(
        skip=skip,
        limit=limit,
        repository_path=repository_path,
        status=status,
        branch=branch,
        user_id=current_user.id
    )
    
    return scans


@router.get("/{scan_id}/files", response_model=List[FileMetrics])
async def get_scan_files(
    scan_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    """
    Get file-level metrics for a scan.
    
    Args:
        scan_id: Scan identifier
        skip: Number of records to skip
        limit: Maximum records to return
        repository: Scan repository
        
    Returns:
        List of file metrics
    """
    # Verify scan exists
    scan = await repository.get_scan(scan_id)
    if not scan or (scan.user_id and scan.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Get file metrics
    file_metrics = await repository.get_file_metrics(
        scan_id,
        skip=skip,
        limit=limit
    )
    
    return file_metrics


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a scan and its stored file metrics.
    
    Args:
        scan_id: Scan identifier
        repository: Scan repository
    """
    scan = await repository.get_scan(scan_id)
    
    if not scan or (scan.user_id and scan.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Scan not found")

    deleted = await repository.delete_scan(scan_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete scan")

    logger.info(f"Scan deleted: {scan_id}")


@router.post("/{scan_id}/retry", response_model=ScanResponse)
async def retry_scan(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user),
    redis: RedisManager = Depends(get_redis)
):
    """
    Retry a failed scan.
    
    Args:
        scan_id: Scan identifier
        repository: Scan repository
        redis: Redis manager
        
    Returns:
        New scan response
    """
    scan = await repository.get_scan(scan_id)
    
    if not scan or (scan.user_id and scan.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != ScanStatus.FAILED:
        raise HTTPException(
            status_code=400,
            detail="Can only retry failed scans"
        )
    
    # Create new scan
    new_scan = Scan(
        user_id=current_user.id,
        saved_repository_id=scan.saved_repository_id,
        repository_path=scan.repository_path,
        branch=scan.branch,
        incremental=scan.incremental,
        status=ScanStatus.QUEUED
    )
    
    new_scan_id = await repository.create_scan(new_scan)
    
    # Enqueue job
    job_id = await redis.enqueue_job({
        "scan_id": new_scan_id,
        "repository_path": scan.repository_path,
        "branch": scan.branch,
        "incremental": scan.incremental
    })
    
    return ScanResponse(
        scan_id=new_scan_id,
        job_id=job_id,
        status=ScanStatus.QUEUED,
        message="Scan retry initiated"
    )


@router.get("/{scan_id}/status")
async def get_scan_status(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user),
    redis: RedisManager = Depends(get_redis)
):
    """
    Get current scan status with progress information.
    
    Args:
        scan_id: Scan identifier
        repository: Scan repository
        redis: Redis manager
        
    Returns:
        Status and progress information
    """
    scan = await repository.get_scan(scan_id)
    
    if not scan or (scan.user_id and scan.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return {
        "scan_id": scan_id,
        "status": scan.status,
        "progress": scan.progress,
        "files_processed": scan.files_processed,
        "files_total": scan.files_total,
        "current_file": scan.current_file,
        "created_at": scan.created_at,
        "started_at": scan.started_at,
        "completed_at": scan.completed_at,
        "error_message": scan.error_message
    }
