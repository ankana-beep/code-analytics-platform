"""
Application configuration and settings management.
Uses pydantic-settings for environment-based configuration.
"""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Application
    app_name: str = "Code Analytics Platform"
    app_version: str = "1.0.0"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # MongoDB
    mongodb_url: str = Field(
        default="mongodb://mongodb:27017",
        description="MongoDB connection URL"
    )
    mongodb_database: str = "code_analytics"
    mongodb_max_pool_size: int = 100
    mongodb_min_pool_size: int = 10

    # Cache
    redis_url: str | None = "redis://redis:6379/0"
    cache_enabled: bool = True
    cache_ttl_seconds: int = 300

    # Logging
    log_level: str = "INFO"
    
    # CORS
    cors_origins: list[str] = Field(
        default_factory=lambda: ["*"]
    )


# Global settings instance
settings = Settings()
