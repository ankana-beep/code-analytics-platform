"""
Main FastAPI application.
Configures middleware, CORS, routes, and application lifecycle.
"""
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import logger
from app.core.database import mongodb_manager
from app.core.redis import redis_manager
from app.core.metrics import metrics
from app.api.v1 import auth, github, repositories, reports, scans, health, websocket


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting Code Analytics Platform")
    
    try:
        # Connect to databases
        await mongodb_manager.connect()
        await redis_manager.connect()
        
        logger.info("All services connected successfully")
        
        yield
    
    finally:
        # Shutdown
        logger.info("Shutting down Code Analytics Platform")
        
        # Disconnect from databases
        await mongodb_manager.disconnect()
        await redis_manager.disconnect()
        
        logger.info("All services disconnected")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Production-grade distributed code analytics platform",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# GZip Compression Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Request Logging and Metrics Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all HTTP requests and record metrics.
    
    Captures request details, response time, and status codes
    for observability and performance monitoring.
    """
    start_time = time.time()
    
    # Log request
    logger.info(
        "Request started",
        extra={
            "method": request.method,
            "path": request.url.path,
            "client": request.client.host if request.client else None
        }
    )
    
    # Process request
    try:
        response = await call_next(request)
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Record metrics
        metrics.record_request(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code,
            duration=duration
        )
        
        # Log response
        logger.info(
            "Request completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration": duration
            }
        )
        
        # Add response headers
        response.headers["X-Process-Time"] = str(duration)
        
        return response
    
    except Exception as e:
        duration = time.time() - start_time
        
        logger.error(
            "Request failed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "error": str(e),
                "duration": duration
            },
            exc_info=True
        )
        
        # Record error metrics
        metrics.record_request(
            method=request.method,
            endpoint=request.url.path,
            status=500,
            duration=duration
        )
        
        raise


# Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors.
    
    Logs the error and returns a standardized error response.
    """
    logger.error(
        "Unhandled exception",
        extra={
            "method": request.method,
            "path": request.url.path,
            "error": str(exc)
        },
        exc_info=True
    )
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.debug else "An unexpected error occurred"
        }
    )


# Include routers
app.include_router(health.router, prefix=settings.api_v1_prefix)
app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(github.router, prefix=settings.api_v1_prefix)
app.include_router(repositories.router, prefix=settings.api_v1_prefix)
app.include_router(reports.router, prefix=settings.api_v1_prefix)
app.include_router(scans.router, prefix=settings.api_v1_prefix)
app.include_router(websocket.router)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs" if settings.debug else None
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers,
        log_config=None,  # Use our custom logging
        access_log=False  # Handled by middleware
    )
