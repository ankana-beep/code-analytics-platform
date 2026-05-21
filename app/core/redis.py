"""
Redis connection manager and job queue implementation.
Provides async Redis operations and job queue functionality.
"""
import json
import uuid
from typing import Optional, Any, Dict
from redis.asyncio import Redis, ConnectionPool
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import logger


class RedisManager:
    """Manages Redis connection lifecycle and provides queue operations."""
    
    def __init__(self):
        self.pool: Optional[ConnectionPool] = None
        self.redis: Optional[Redis] = None
    
    async def connect(self):
        """Establish connection to Redis with connection pooling."""
        try:
            self.pool = ConnectionPool.from_url(
                settings.redis_url,
                max_connections=settings.redis_max_connections,
                decode_responses=True
            )
            
            self.redis = Redis(connection_pool=self.pool)
            
            # Verify connection
            await self.redis.ping()
            
            logger.info(
                "Redis connected",
                extra={
                    "url": settings.redis_url.split("@")[-1]  # Hide credentials
                }
            )
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            raise
    
    async def disconnect(self):
        """Close Redis connection and cleanup resources."""
        if self.redis:
            await self.redis.close()
            if self.pool:
                await self.pool.disconnect()
            logger.info("Redis disconnected")
    
    async def enqueue_job(self, job_data: Dict[str, Any]) -> str:
        """
        Enqueue a new scan job to the queue.
        
        Args:
            job_data: Job data dictionary containing scan parameters
            
        Returns:
            Job ID for tracking
        """
        job_id = str(uuid.uuid4())
        job_data['job_id'] = job_id
        
        try:
            # Push job to queue
            await self.redis.lpush(
                settings.queue_name,
                json.dumps(job_data)
            )
            
            # Store job status
            await self.redis.setex(
                f"job:{job_id}:status",
                settings.queue_result_ttl,
                "queued"
            )
            
            logger.info(
                "Job enqueued",
                extra={"job_id": job_id, "repository": job_data.get('repository_path')}
            )
            
            return job_id
        except RedisError as e:
            logger.error(f"Failed to enqueue job: {str(e)}")
            raise
    
    async def dequeue_job(self, timeout: int = 5) -> Optional[Dict[str, Any]]:
        """
        Dequeue a job from the queue with blocking pop.
        
        Args:
            timeout: Timeout in seconds for blocking pop
            
        Returns:
            Job data dictionary or None if timeout
        """
        try:
            result = await self.redis.brpop(
                settings.queue_name,
                timeout=timeout
            )
            
            if result:
                _, job_data = result
                return json.loads(job_data)
            
            return None
        except RedisError as e:
            logger.error(f"Failed to dequeue job: {str(e)}")
            return None
    
    async def get_queue_length(self) -> int:
        """Get the current length of the job queue."""
        try:
            return await self.redis.llen(settings.queue_name)
        except RedisError:
            return 0
    
    async def set_job_status(self, job_id: str, status: str, data: Optional[Dict] = None):
        """
        Update job status in Redis.
        
        Args:
            job_id: Job identifier
            status: New status (queued, processing, completed, failed)
            data: Optional additional data to store
        """
        try:
            await self.redis.setex(
                f"job:{job_id}:status",
                settings.queue_result_ttl,
                status
            )
            
            if data:
                await self.redis.setex(
                    f"job:{job_id}:data",
                    settings.queue_result_ttl,
                    json.dumps(data)
                )
            
            logger.debug(
                "Job status updated",
                extra={"job_id": job_id, "status": status}
            )
        except RedisError as e:
            logger.error(f"Failed to update job status: {str(e)}")
    
    async def get_job_status(self, job_id: str) -> Optional[str]:
        """Get the current status of a job."""
        try:
            status = await self.redis.get(f"job:{job_id}:status")
            return status
        except RedisError:
            return None
    
    async def get_job_data(self, job_id: str) -> Optional[Dict]:
        """Get the result data of a completed job."""
        try:
            data = await self.redis.get(f"job:{job_id}:data")
            if data:
                return json.loads(data)
            return None
        except RedisError:
            return None
    
    async def publish_progress(self, scan_id: str, progress_data: Dict[str, Any]):
        """
        Publish scan progress to a channel for WebSocket updates.
        
        Args:
            scan_id: Scan identifier
            progress_data: Progress information to broadcast
        """
        try:
            await self.redis.publish(
                f"scan:{scan_id}:progress",
                json.dumps(progress_data)
            )
        except RedisError as e:
            logger.error(f"Failed to publish progress: {str(e)}")
    
    async def subscribe_progress(self, scan_id: str):
        """
        Subscribe to scan progress updates.
        
        Args:
            scan_id: Scan identifier
            
        Returns:
            Async iterator of progress updates
        """
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(f"scan:{scan_id}:progress")
        return pubsub
    
    async def cache_get(self, key: str) -> Optional[str]:
        """Get cached value by key."""
        if not settings.cache_enabled:
            return None
        
        try:
            return await self.redis.get(f"cache:{key}")
        except RedisError:
            return None
    
    async def cache_set(self, key: str, value: str, ttl: Optional[int] = None):
        """Set cached value with optional TTL."""
        if not settings.cache_enabled:
            return
        
        try:
            ttl = ttl or settings.cache_ttl
            await self.redis.setex(f"cache:{key}", ttl, value)
        except RedisError as e:
            logger.error(f"Failed to set cache: {str(e)}")

    async def set_session(self, token_id: str, user_id: str, ttl: Optional[int] = None):
        """Store an authenticated session keyed by JWT id."""
        try:
            await self.redis.setex(
                f"session:{token_id}",
                ttl or settings.session_ttl,
                user_id
            )
        except RedisError as e:
            logger.error(f"Failed to set session: {str(e)}")

    async def get_session(self, token_id: str) -> Optional[str]:
        """Get the user id for an active JWT session."""
        try:
            return await self.redis.get(f"session:{token_id}")
        except RedisError:
            return None

    async def delete_session(self, token_id: str):
        """Delete a JWT session."""
        try:
            await self.redis.delete(f"session:{token_id}")
        except RedisError as e:
            logger.error(f"Failed to delete session: {str(e)}")

    async def blacklist_token(self, token_id: str, ttl: Optional[int] = None):
        """Add a JWT id to the token blacklist."""
        try:
            await self.redis.setex(
                f"token_blacklist:{token_id}",
                ttl or settings.session_ttl,
                "1"
            )
        except RedisError as e:
            logger.error(f"Failed to blacklist token: {str(e)}")

    async def is_token_blacklisted(self, token_id: str) -> bool:
        """Return whether a JWT id has been revoked."""
        try:
            return bool(await self.redis.exists(f"token_blacklist:{token_id}"))
        except RedisError:
            return True


# Global Redis manager instance
redis_manager = RedisManager()


async def get_redis() -> RedisManager:
    """Dependency injection for Redis access."""
    return redis_manager
