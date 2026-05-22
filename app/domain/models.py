"""Domain models used by the foundation API."""
from datetime import datetime

from pydantic import BaseModel, Field


class HealthCheck(BaseModel):
    """Health check response."""

    status: str
    version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: dict[str, str] = Field(default_factory=dict)
