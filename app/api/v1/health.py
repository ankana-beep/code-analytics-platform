"""Health and runtime information endpoints."""
from fastapi import APIRouter, Response

from app.domain.models import HealthCheck
from app.core.cache import cache_manager
from app.core.config import settings
from app.core.database import mongodb_manager
from app.core.logging import logger


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthCheck)
async def health_check():
    """
    Health check endpoint for load balancers and local runtime checks.
    
    Checks connectivity to MongoDB and returns status information.
    
    Returns:
        Health check response with service statuses
    """
    services = {}
    overall_status = "healthy"
    
    # Check MongoDB
    try:
        if mongodb_manager.database is not None:
            await mongodb_manager.database.command('ping')
            services['mongodb'] = "healthy"
        else:
            services['mongodb'] = "disconnected"
            overall_status = "unhealthy"
    except Exception as e:
        logger.error(f"MongoDB health check failed: {str(e)}")
        services['mongodb'] = "unhealthy"
        overall_status = "unhealthy"

    if settings.cache_enabled and settings.redis_url:
        services["redis"] = "healthy" if cache_manager.is_connected else "disconnected"
    
    return HealthCheck(
        status=overall_status,
        version=settings.app_version,
        services=services
    )


@router.get("/ready")
async def readiness_check():
    """
    Kubernetes readiness probe endpoint.
    
    Returns 200 if the application is ready to serve traffic.
    Returns 503 if dependencies are not available.
    """
    try:
        # Check critical dependencies
        if mongodb_manager.database is not None:
            await mongodb_manager.database.command('ping')
        
        return {"status": "ready"}
    
    except Exception as e:
        logger.error(f"Readiness check failed: {str(e)}")
        return Response(
            content='{"status": "not ready"}',
            status_code=503,
            media_type="application/json"
        )


@router.get("/live")
async def liveness_check():
    """
    Kubernetes liveness probe endpoint.
    
    Returns 200 if the application is alive (not deadlocked).
    This is a simple check that doesn't verify dependencies.
    """
    return {"status": "alive"}


@router.get("/info")
async def app_info():
    """
    Application information endpoint.
    
    Returns basic application metadata.
    """
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": "production" if not settings.debug else "development"
    }
