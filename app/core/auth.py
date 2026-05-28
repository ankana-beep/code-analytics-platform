"""
JWT authentication helpers for GitHub OAuth.
"""
from datetime import datetime, timedelta
from typing import Any

from fastapi import Cookie, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWTError

from app.core.config import settings
from app.domain.models import UserProfile

security_scheme = HTTPBearer(auto_error=False)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token for the authenticated user."""
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT_SECRET_KEY must be configured for token signing")

    payload = data.copy()
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload.update(
        {
            "exp": expire,
            "iat": now,
            "nbf": now,
            "iss": settings.jwt_issuer,
            "typ": "access",
        }
    )

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    if not settings.jwt_secret_key:
        raise HTTPException(status_code=500, detail="JWT signing is not configured")

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "nbf", "iss", "sub"]},
        )
    except PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token") from exc

    if payload.get("typ") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    return payload


def get_token_from_request(
    authorization: HTTPAuthorizationCredentials | None = Security(security_scheme),
    access_token: str | None = Cookie(default=None, alias=settings.auth_token_cookie_name),
) -> str:
    """Extract the access token from Authorization header or authentication cookie."""
    if authorization and authorization.scheme.lower() == "bearer":
        return authorization.credentials

    if access_token:
        return access_token

    raise HTTPException(status_code=401, detail="Missing authentication token")


def get_current_user(token: str = Depends(get_token_from_request)) -> UserProfile:
    """Return the authenticated user profile from a validated token."""
    payload = decode_access_token(token)

    try:
        return UserProfile(
            github_id=int(payload["sub"]),
            login=str(payload["login"]),
            name=payload.get("name"),
            email=payload.get("email"),
            avatar_url=payload.get("avatar_url"),
            profile_url=payload.get("profile_url"),
        )
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=401, detail="Invalid token payload") from exc


def get_optional_current_user(
    authorization: HTTPAuthorizationCredentials | None = Security(security_scheme),
    access_token: str | None = Cookie(default=None, alias=settings.auth_token_cookie_name),
) -> UserProfile | None:
    """Return the current user when a valid token is present, otherwise None."""
    try:
        token = get_token_from_request(authorization, access_token)
        return get_current_user(token)
    except HTTPException as exc:
        if exc.status_code == 401:
            return None
        raise
