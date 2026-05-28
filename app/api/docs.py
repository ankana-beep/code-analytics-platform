"""Protected API documentation routes."""
from __future__ import annotations

import secrets

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.core.config import settings


docs_security = HTTPBasic()


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


def register_docs_routes(app: FastAPI) -> None:
    """Attach protected OpenAPI, Swagger UI, and ReDoc routes to the app."""

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_schema(_: str = Depends(require_docs_auth)):
        return get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )

    @app.get("/docs", include_in_schema=False)
    async def swagger_ui(_: str = Depends(require_docs_auth)):
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title=f"{app.title} - Swagger UI",
        )

    @app.get("/redoc", include_in_schema=False)
    async def redoc_ui(_: str = Depends(require_docs_auth)):
        return get_redoc_html(
            openapi_url="/openapi.json",
            title=f"{app.title} - ReDoc",
        )
