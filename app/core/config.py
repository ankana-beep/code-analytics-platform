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

    # Observability
    enable_metrics: bool = True
    enable_tracing: bool = True
    log_level: str = "INFO"
    
    # CORS
    cors_origins: list[str] = Field(
        default_factory=lambda: ["*"]
    )

    # Authentication
    jwt_secret_key: str | None = Field(
        default=None,
        description="Secret key used to sign application JWTs",
    )
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "code-analytics-platform"
    access_token_expire_minutes: int = 60
    session_ttl: int = 3600
    auth_token_cookie_name: str = "cap_access_token"
    auth_cookie_secure: bool = True
    auth_cookie_samesite: str = "lax"

    # GitHub OAuth
    github_client_id: str | None = Field(
        default=None,
        description="GitHub OAuth application client ID",
    )
    github_client_secret: str | None = Field(
        default=None,
        description="GitHub OAuth application client secret",
    )
    github_oauth_callback_url: str | None = Field(
        default=None,
        description="Backend callback URL registered with the GitHub OAuth app",
    )
    github_oauth_timeout_seconds: float = 10.0


# Global settings instance
settings = Settings()
