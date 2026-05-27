"""Helpers for validating and reading public GitHub repository metadata."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.core.cache import cache_manager
from app.core.config import settings


GITHUB_OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
GITHUB_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
GITHUB_REPO_URL_RE = re.compile(
    r"^https://github\.com/(?P<owner>[A-Za-z0-9-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?/?$"
)


class GitHubError(ValueError):
    """Raised when a GitHub resource cannot be validated or fetched."""


@dataclass(frozen=True)
class GitHubRepositoryRef:
    owner: str
    repo: str

    @property
    def html_url(self) -> str:
        return f"https://github.com/{self.owner}/{self.repo}"


def parse_github_repository(value: str) -> Optional[GitHubRepositoryRef]:
    """Parse a public GitHub repository URL."""
    normalized = value.strip()
    match = GITHUB_REPO_URL_RE.match(normalized)
    if not match:
        return None

    owner = match.group("owner")
    repo = match.group("repo")
    if not is_valid_owner(owner) or not is_valid_repo(repo):
        return None

    return GitHubRepositoryRef(owner=owner, repo=repo)


def is_valid_owner(value: str) -> bool:
    return bool(GITHUB_OWNER_RE.match(value.strip()))


def is_valid_repo(value: str) -> bool:
    return bool(GITHUB_REPO_RE.match(value.strip()))


def github_api_get(path: str) -> Any:
    """GET JSON from the GitHub API using only public unauthenticated access."""
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "code-analytics-platform",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise GitHubError("GitHub resource was not found or is not public") from exc
        if exc.code == 403:
            raise GitHubError("GitHub API rate limit reached. Try again later.") from exc
        raise GitHubError(f"GitHub API request failed with status {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise GitHubError("Unable to connect to GitHub") from exc


def list_public_repositories(username: str) -> List[Dict[str, Any]]:
    """Return public repositories for a public GitHub username."""
    if not is_valid_owner(username):
        raise GitHubError("Enter a valid public GitHub username")

    repos = github_api_get(
        f"/users/{urllib.parse.quote(username, safe='')}/repos?type=public&sort=updated&per_page=100"
    )
    return [
        {
            "name": repo["name"],
            "full_name": repo["full_name"],
            "html_url": repo["html_url"],
            "default_branch": repo.get("default_branch") or "main",
            "description": repo.get("description"),
            "language": repo.get("language"),
            "updated_at": repo.get("updated_at"),
        }
        for repo in repos
        if not repo.get("private")
    ]


def list_public_branches(owner: str, repo: str) -> List[Dict[str, str]]:
    """Return branches for a public GitHub repository."""
    if not is_valid_owner(owner) or not is_valid_repo(repo):
        raise GitHubError("Enter a valid public GitHub repository")

    branches = github_api_get(
        f"/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repo, safe='')}/branches?per_page=100"
    )
    return [
        {
            "name": branch["name"],
            "sha": branch.get("commit", {}).get("sha", ""),
        }
        for branch in branches
    ]


async def list_public_repositories_cached(username: str) -> List[Dict[str, Any]]:
    """Return public repositories, using Redis cache when enabled."""
    cache_key = f"github:user-repos:{username.lower()}"
    if settings.cache_enabled:
        cached = await cache_manager.get_json(cache_key)
        if cached is not None:
            return cached

    repositories = list_public_repositories(username)
    if settings.cache_enabled:
        await cache_manager.set_json(cache_key, repositories)
    return repositories


async def list_public_branches_cached(owner: str, repo: str) -> List[Dict[str, str]]:
    """Return public branches, using Redis cache when enabled."""
    cache_key = f"github:repo-branches:{owner.lower()}:{repo.lower()}"
    if settings.cache_enabled:
        cached = await cache_manager.get_json(cache_key)
        if cached is not None:
            return cached

    branches = list_public_branches(owner, repo)
    if settings.cache_enabled:
        await cache_manager.set_json(cache_key, branches)
    return branches
