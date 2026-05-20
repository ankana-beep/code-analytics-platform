"""Authentication helpers for password hashing, JWTs, and current-user lookup."""
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.database import get_database
from app.core.redis import RedisManager, get_redis
from app.domain.models import User
from app.repositories.user_repository import UserRepository


bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user: User) -> tuple[str, str, int]:
    """Create a signed JWT with a unique session id."""
    if not user.id:
        raise ValueError("Cannot create token for user without id")

    jti = str(uuid4())
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expires_at = datetime.utcnow() + expires_delta
    payload = {
        "sub": user.id,
        "email": user.email,
        "jti": jti,
        "type": "access",
        "exp": expires_at,
        "iat": datetime.utcnow()
    }

    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        ) from exc

    if payload.get("type") != "access" or not payload.get("sub") or not payload.get("jti"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    return payload


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis: RedisManager = Depends(get_redis)
) -> User:
    """Verify the bearer token against JWT, Redis blacklist, Redis session, and Mongo user state."""
    if not settings.auth_enabled:
        user = await UserRepository(db).get_first_active_user()
        if user:
            return user
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication is disabled but no user exists")

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required"
        )

    payload = decode_access_token(credentials.credentials)
    jti = payload["jti"]

    if await redis.is_token_blacklisted(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication token has been revoked")

    session_user_id = await redis.get_session(jti)
    if session_user_id != payload["sub"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication session is no longer active")

    user = await UserRepository(db).get_user(payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or missing")

    return user
