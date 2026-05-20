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
    workers: int = 4
    
    # MongoDB
    mongodb_url: str = Field(
        default="mongodb://mongodb:27017",
        description="MongoDB connection URL"
    )
    mongodb_database: str = "code_analytics"
    mongodb_max_pool_size: int = 100
    mongodb_min_pool_size: int = 10
    
    # Redis
    redis_url: str = Field(
        default="redis://redis:6379/0",
        description="Redis connection URL"
    )
    redis_max_connections: int = 50
    
    # Queue
    queue_name: str = "scan_jobs"
    queue_result_ttl: int = 3600  # 1 hour
    queue_timeout: int = 300  # 5 minutes
    
    # Worker
    worker_concurrency: int = 10
    worker_max_retries: int = 3
    worker_retry_delay: int = 5
    worker_pool_size: int = 4
    
    # Scanning
    scan_timeout: int = 3600  # 1 hour
    scan_max_file_size: int = 10 * 1024 * 1024  # 10MB
    scan_chunk_size: int = 100
    scan_concurrency_limit: int = 50
    
    # Cache
    cache_ttl: int = 3600  # 1 hour
    cache_enabled: bool = True
    
    # Rate Limiting
    rate_limit_per_minute: int = 100
    rate_limit_burst: int = 200
    
    # Security
    auth_enabled: bool = True
    jwt_secret_key: str = Field(
        default="change-this-secret-in-production",
        description="Secret key used to sign JWT access tokens"
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    session_ttl: int = 3600
    allowed_extensions: list[str] = Field(
        default_factory=lambda: [
            ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rb", ".php",
            ".json", ".yml", ".yaml", ".toml", ".md", ".lock"
        ]
    )
    allowed_filenames: list[str] = Field(
        default_factory=lambda: ["Dockerfile", "Dockerfile.bun", "Makefile"]
    )
    max_repo_size: int = 10 * 1024 * 1024 * 1024  # 10GB
    
    # Observability
    enable_metrics: bool = True
    enable_tracing: bool = True
    log_level: str = "INFO"
    
    # CORS
    cors_origins: list[str] = Field(
        default_factory=lambda: ["*"]
    )


# Global settings instance
settings = Settings()
