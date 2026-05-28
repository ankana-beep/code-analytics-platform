"""
Main FastAPI application.
Configures middleware, CORS, routes, and application lifecycle.
"""
import secrets
import time
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import logger
from app.core.database import mongodb_manager
from app.core.cache import cache_manager
from app.api.v1 import auth, basic_scans, github, health


docs_security = HTTPBasic()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting Code Analytics Platform")
    
    try:
        # The foundation scanner works without MongoDB. Connect when available,
        # but keep local starter mode usable.
        try:
            await mongodb_manager.connect()
            logger.info("Database connected successfully")
        except Exception as exc:
            logger.warning(
                "Starting in foundation mode without MongoDB",
                extra={"error": str(exc)}
            )

        await cache_manager.connect()
        
        yield
    
    finally:
        # Shutdown
        logger.info("Shutting down Code Analytics Platform")
        
        await cache_manager.disconnect()
        await mongodb_manager.disconnect()
        
        logger.info("Database disconnected")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Production-grade distributed code analytics platform",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def _docs_are_enabled() -> bool:
    return settings.docs_enabled or settings.debug


def require_docs_auth(credentials: HTTPBasicCredentials = Depends(docs_security)) -> str:
    """Require HTTP Basic auth for documentation endpoints."""
    expected_username = settings.docs_username or ""
    expected_password = settings.docs_password or ""

    username_matches = secrets.compare_digest(credentials.username, expected_username)
    password_matches = secrets.compare_digest(credentials.password, expected_password)

    if not (expected_username and expected_password and username_matches and password_matches):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid documentation credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username


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


# Request Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all HTTP requests.

    Captures request details, response time, and status codes.
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
app.include_router(basic_scans.router, prefix=settings.api_v1_prefix)
app.include_router(github.router, prefix=settings.api_v1_prefix)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs" if _docs_are_enabled() else None
    }


@app.get("/openapi.json", include_in_schema=False)
async def openapi_schema(_: str = Depends(require_docs_auth)):
    if not _docs_are_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    return get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )


@app.get("/docs", include_in_schema=False)
async def swagger_ui(_: str = Depends(require_docs_auth)):
    if not _docs_are_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - Swagger UI",
    )


@app.get("/redoc", include_in_schema=False)
async def redoc_ui(_: str = Depends(require_docs_auth)):
    if not _docs_are_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - ReDoc",
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_config=None,  # Use our custom logging
        access_log=False  # Handled by middleware
    )
