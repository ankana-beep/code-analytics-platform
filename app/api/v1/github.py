"""Public GitHub metadata endpoints."""
from fastapi import APIRouter, HTTPException

from app.services.github_service import (
    GitHubError,
    list_public_branches_cached,
    list_public_repositories_cached,
    list_repository_work_in_progress_cached,
)


router = APIRouter(prefix="/github", tags=["github"])


@router.get("/users/{username}/repositories")
async def get_public_repositories(username: str):
    """List public repositories for a public GitHub username."""
    try:
        return await list_public_repositories_cached(username)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/repositories/{owner}/{repo}/branches")
async def get_public_repository_branches(owner: str, repo: str):
    """List branches for a public GitHub repository."""
    try:
        return await list_public_branches_cached(owner, repo)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/repositories/{owner}/{repo}/work-in-progress")
async def get_repository_work_in_progress(owner: str, repo: str, weeks: int = 8):
    """Return open pull requests grouped by creation week."""
    try:
        return await list_repository_work_in_progress_cached(owner, repo, weeks)
    except GitHubError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
