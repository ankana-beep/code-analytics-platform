"""User persistence helpers for GitHub-authenticated accounts."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.core.database import mongodb_manager


def get_users_collection():
    """Return the users collection or raise a service unavailable response."""
    try:
        return mongodb_manager.get_database().users
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


async def upsert_github_user(profile: dict[str, Any], access_token: str) -> dict[str, Any]:
    """Create or update a GitHub user and store their backend-only OAuth token."""
    collection = get_users_collection()
    now = datetime.utcnow()
    github_id = str(profile["github_id"])

    await collection.update_one(
        {"_id": github_id},
        {
            "$set": {
                "login": profile["login"],
                "name": profile.get("name"),
                "email": profile.get("email"),
                "avatar_url": profile.get("avatar_url"),
                "profile_url": profile.get("profile_url"),
                "github_access_token": access_token,
                "github_token_updated_at": now,
                "last_login_at": now,
            },
            "$setOnInsert": {"created_at": now, "github_id": profile["github_id"]},
        },
        upsert=True,
    )

    user = await collection.find_one({"_id": github_id})
    if user is None:
        raise HTTPException(status_code=500, detail="Failed to persist authenticated user")

    return serialize_user_profile(user)


async def get_github_access_token(github_id: int) -> str | None:
    """Return the stored GitHub OAuth token for a user, if one is available."""
    collection = get_users_collection()
    user = await collection.find_one(
        {"_id": str(github_id)},
        {"github_access_token": 1},
    )
    token = user.get("github_access_token") if user else None
    return token if isinstance(token, str) and token else None


def serialize_user_profile(user: dict[str, Any]) -> dict[str, Any]:
    """Return the public user fields allowed in API responses and JWT claims."""
    return {
        "github_id": user["github_id"],
        "login": user["login"],
        "name": user.get("name"),
        "email": user.get("email"),
        "avatar_url": user.get("avatar_url"),
        "profile_url": user.get("profile_url"),
    }
