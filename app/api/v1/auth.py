"""Authentication endpoints for email/password login."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.database import get_database
from app.core.redis import RedisManager, get_redis
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_current_user,
    hash_password,
    verify_password,
    bearer_scheme
)
from app.domain.models import TokenResponse, User, UserCreate, UserLogin, UserPublic
from app.repositories.user_repository import UserRepository


router = APIRouter(prefix="/auth", tags=["auth"])


def public_user(user: User) -> UserPublic:
    """Convert a user document to a public profile."""
    return UserPublic(
        id=user.id or "",
        email=user.email,
        full_name=user.full_name
    )


async def issue_token(user: User, redis: RedisManager, users: UserRepository) -> TokenResponse:
    """Create JWT, persist Redis session, and return the client payload."""
    token, token_id, expires_in = create_access_token(user)
    await redis.set_session(token_id, user.id or "", expires_in)
    await users.update_last_login(user.id or "")
    return TokenResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    request: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis: RedisManager = Depends(get_redis)
):
    users = UserRepository(db)
    user = User(
        email=request.email.lower(),
        full_name=request.full_name,
        password_hash=hash_password(request.password)
    )

    try:
        user_id = await users.create_user(user)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email is already registered") from exc

    created = await users.get_user(user_id)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to load created user")

    return await issue_token(created, redis, users)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: UserLogin,
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis: RedisManager = Depends(get_redis)
):
    users = UserRepository(db)
    user = await users.get_user_by_email(request.email)
    if not user or not user.password_hash or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    return await issue_token(user, redis, users)


@router.post("/logout", status_code=204)
async def logout(
    credentials = Depends(bearer_scheme),
    redis: RedisManager = Depends(get_redis)
):
    if not credentials:
        return None

    payload = decode_access_token(credentials.credentials)
    token_id = payload["jti"]
    exp = payload.get("exp")
    ttl = max(int(exp - datetime.utcnow().timestamp()), 1) if exp else settings.session_ttl
    await redis.blacklist_token(token_id, ttl)
    await redis.delete_session(token_id)
    return None


@router.get("/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)):
    return public_user(current_user)
