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
    docs_enabled: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # MongoDB
    mongodb_uri: str | None = Field(
        default=None,
        description="MongoDB connection URI"
    )
    mongodb_database: str = "code_analytics"
    mongodb_max_pool_size: int = 100
    mongodb_min_pool_size: int = 10

    # Redis is reserved for AI summary caching and AI summary rate limiting.
    redis_url: str | None = "redis://redis:6379/0"

    # OpenAI AI summaries
    openai_api_key: str | None = Field(
        default=None,
        description="OpenAI API key used to generate repository summaries",
    )
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        description="Base URL for the OpenAI API",
    )
    openai_summary_model: str = Field(
        default="gpt-5-mini",
        description="OpenAI model used for repository AI summaries",
    )
    openai_timeout_seconds: float = 20.0
    ai_summary_cache_ttl_seconds: int = 86400
    ai_summary_rate_limit_requests: int = 2
    ai_summary_rate_limit_window_seconds: int = 60

    # Logging
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
    docs_username: str | None = Field(
        default=None,
        description="Username required to access Swagger UI and ReDoc",
    )
    docs_password: str | None = Field(
        default=None,
        description="Password required to access Swagger UI and ReDoc",
    )

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
