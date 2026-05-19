"""
Scan API router with CRUD operations and pagination.
Implements API versioning, filtering, and caching.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import JSONResponse

from app.domain.models import (
    ScanRequest, ScanResponse, Scan, ScanStatus,
    FileMetrics
)
from app.core.database import get_database
from app.core.redis import get_redis, RedisManager
from app.repositories.scan_repository import ScanRepository
from app.core.logging import logger
from motor.motor_asyncio import AsyncIOMotorDatabase
import json
import hashlib


router = APIRouter(prefix="/scans", tags=["scans"])


async def get_scan_repository(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> ScanRepository:
    """Dependency injection for scan repository."""
    return ScanRepository(db)


@router.post("", response_model=ScanResponse, status_code=201)
async def create_scan(
    request: ScanRequest,
    repository: ScanRepository = Depends(get_scan_repository),
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
        # Check cache for recent scan
        cache_key = f"{request.repository_path}:{request.branch}"
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
            repository_path=request.repository_path,
            branch=request.branch,
            incremental=request.incremental,
            status=ScanStatus.QUEUED
        )
        
        scan_id = await repository.create_scan(scan)
        
        # Enqueue job
        job_id = await redis.enqueue_job({
            "scan_id": scan_id,
            "repository_path": request.repository_path,
            "branch": request.branch,
            "incremental": request.incremental,
            "analyzers": request.analyzers or []
        })
        
        logger.info(
            "Scan created and job enqueued",
            extra={
                "scan_id": scan_id,
                "job_id": job_id,
                "repository": request.repository_path
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


@router.get("/{scan_id}", response_model=Scan)
async def get_scan(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository)
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
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return scan


@router.get("", response_model=List[Scan])
async def list_scans(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(10, ge=1, le=100, description="Maximum records to return"),
    repository_path: Optional[str] = Query(None, description="Filter by repository path"),
    status: Optional[ScanStatus] = Query(None, description="Filter by status"),
    branch: Optional[str] = Query(None, description="Filter by branch"),
    repository: ScanRepository = Depends(get_scan_repository)
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
        branch=branch
    )
    
    return scans


@router.get("/{scan_id}/files", response_model=List[FileMetrics])
async def get_scan_files(
    scan_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    repository: ScanRepository = Depends(get_scan_repository)
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
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Get file metrics
    file_metrics = await repository.get_file_metrics(
        scan_id,
        skip=skip,
        limit=limit
    )
    
    return file_metrics


@router.delete("/{scan_id}", status_code=204)
async def cancel_scan(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository)
):
    """
    Cancel a running scan.
    
    Args:
        scan_id: Scan identifier
        repository: Scan repository
    """
    scan = await repository.get_scan(scan_id)
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status not in [ScanStatus.QUEUED, ScanStatus.PROCESSING]:
        raise HTTPException(
            status_code=400,
            detail="Can only cancel queued or processing scans"
        )
    
    # Update status
    await repository.update_scan(scan_id, {
        "status": ScanStatus.CANCELLED
    })
    
    logger.info(f"Scan cancelled: {scan_id}")


@router.post("/{scan_id}/retry", response_model=ScanResponse)
async def retry_scan(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
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
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != ScanStatus.FAILED:
        raise HTTPException(
            status_code=400,
            detail="Can only retry failed scans"
        )
    
    # Create new scan
    new_scan = Scan(
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
    
    if not scan:
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
