"""Public GitHub metadata endpoints."""
from fastapi import APIRouter, HTTPException

from app.services.github_service import (
    GitHubError,
    list_public_repositories,
    list_repository_branches,
    list_repository_work_in_progress,
)


router = APIRouter(prefix="/github", tags=["github"])


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
        return list_repository_branches(owner, repo)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/repositories/{owner}/{repo}/work-in-progress")
async def get_repository_work_in_progress(owner: str, repo: str, weeks: int = 8):
    """Return open pull requests grouped by creation week."""
    try:
        return list_repository_work_in_progress(owner, repo, weeks)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
