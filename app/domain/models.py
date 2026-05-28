"""Domain models used by the foundation API."""
from datetime import datetime

from pydantic import BaseModel, Field


class HealthCheck(BaseModel):
    """Health check response."""

    status: str
    version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: dict[str, str] = Field(default_factory=dict)


class UserProfile(BaseModel):
    """Authenticated GitHub user profile carried in application JWTs."""

    github_id: int = Field(..., description="GitHub unique user identifier")
    login: str = Field(..., description="GitHub username")
    name: str | None = Field(None, description="GitHub display name")
    email: str | None = Field(None, description="Verified GitHub email address")
    avatar_url: str | None = Field(None, description="GitHub avatar URL")
    profile_url: str | None = Field(None, description="GitHub profile URL")
