"""
MongoDB connection manager using Motor async driver.
Implements connection pooling and lifecycle management.
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional

from app.core.config import settings
from app.core.logging import logger


class MongoDBManager:
    """Manages MongoDB connection lifecycle and provides database access."""
    
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.database: Optional[AsyncIOMotorDatabase] = None
    
    async def connect(self):
        """Establish connection to MongoDB with connection pooling."""
        if not settings.mongodb_url:
            logger.info("MongoDB URL not configured; skipping database connection")
            return

        try:
            self.client = AsyncIOMotorClient(
                settings.mongodb_url,
                maxPoolSize=settings.mongodb_max_pool_size,
                minPoolSize=settings.mongodb_min_pool_size,
                serverSelectionTimeoutMS=5000,
            )
            
            # Verify connection
            await self.client.admin.command('ping')
            
            self.database = self.client[settings.mongodb_database]
            
            # Create indexes
            await self._create_indexes()
            
            logger.info(
                "MongoDB connected",
                extra={
                    "database": settings.mongodb_database,
                    "url": settings.mongodb_url.split("@")[-1]  # Hide credentials
                }
            )
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise
    
    async def _create_indexes(self):
        """Create necessary database indexes for optimal query performance."""
        await self.database.basic_scans.create_index("repository_path")
        await self.database.basic_scans.create_index("repository_name")
        await self.database.basic_scans.create_index("branch")
        await self.database.basic_scans.create_index("status")
        await self.database.basic_scans.create_index("created_at")
        await self.database.users.create_index("github_id", unique=True)
        await self.database.users.create_index("login")
        await self.database.users.create_index("last_login_at")
        
        logger.info("Database indexes created successfully")
    
    async def disconnect(self):
        """Close MongoDB connection and cleanup resources."""
        if self.client is not None:
            self.client.close()
            logger.info("MongoDB disconnected")
    
    def get_database(self) -> AsyncIOMotorDatabase:
        """Get the database instance."""
        if self.database is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self.database


# Global MongoDB manager instance
mongodb_manager = MongoDBManager()


async def get_database() -> AsyncIOMotorDatabase:
    """Dependency injection for database access."""
    return mongodb_manager.get_database()
