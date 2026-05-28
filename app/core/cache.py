"""Optional Redis cache manager for AI summary caching and rate limiting."""
from __future__ import annotations

import json
from typing import Any

from redis.asyncio import Redis

from app.core.config import settings
from app.core.logging import logger


class CacheManager:
    """Manage an optional Redis connection used only for caching."""

    def __init__(self) -> None:
        self.client: Redis | None = None

    async def connect(self) -> None:
        """Connect to Redis when AI summary caching is configured."""
        if not settings.redis_url:
            return

        try:
            self.client = Redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            await self.client.ping()
            logger.info("Redis connected for AI summaries")
        except Exception as exc:
            self.client = None
            logger.warning(
                "Redis unavailable; AI summaries will use in-memory rate limits",
                extra={"error": str(exc)},
            )

    async def disconnect(self) -> None:
        """Close the Redis connection if it exists."""
        if self.client is not None:
            await self.client.aclose()
            self.client = None
            logger.info("Redis disconnected")

    async def get_json(self, key: str) -> Any | None:
        """Read JSON data from the AI summary cache."""
        if self.client is None:
            return None

        cached = await self.client.get(key)
        if cached is None:
            return None
        return json.loads(cached)

    async def set_json(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        """Store JSON data in the AI summary cache."""
        if self.client is None:
            return

        await self.client.set(
            key,
            json.dumps(value),
            ex=ttl_seconds or settings.ai_summary_cache_ttl_seconds,
        )

    @property
    def is_connected(self) -> bool:
        return self.client is not None


cache_manager = CacheManager()
