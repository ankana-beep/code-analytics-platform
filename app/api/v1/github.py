"""Public GitHub metadata endpoints."""
from fastapi import APIRouter, Depends, HTTPException

from app.services.github_service import (
    GitHubError,
    list_public_branches,
    list_public_repositories,
)
from app.core.security import get_current_user


router = APIRouter(prefix="/github", tags=["github"], dependencies=[Depends(get_current_user)])


@router.get("/users/{username}/repositories")
async def get_public_repositories(username: str):
    """List public repositories for a public GitHub username."""
    try:
        return list_public_repositories(username)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/repositories/{owner}/{repo}/branches")
async def get_public_repository_branches(owner: str, repo: str):
    """List branches for a public GitHub repository."""
    try:
        return list_public_branches(owner, repo)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
