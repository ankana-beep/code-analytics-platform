"""GitHub authentication endpoints and session management."""
import asyncio
import urllib.parse
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.core.auth import create_access_token, get_current_user
from app.core.config import settings
from app.services.github_oauth_service import (
    GitHubOAuthError,
    build_github_authorization_url,
    create_oauth_state,
    decode_oauth_state,
    exchange_code_for_access_token,
    fetch_github_user,
    fetch_github_user_emails,
    normalize_github_profile,
)
from app.services.user_service import upsert_github_user


router = APIRouter(prefix="/auth/github", tags=["auth"])


class GitHubLoginResponse(BaseModel):
    """Response returned when the frontend requests the GitHub login URL."""

    authorization_url: str = Field(..., description="GitHub OAuth authorization URL")


class CurrentUserResponse(BaseModel):
    """Authenticated user profile returned by the current user endpoint."""

    github_id: int = Field(..., description="GitHub unique user identifier")
    login: str = Field(..., description="GitHub username")
    name: str | None = Field(None, description="GitHub display name")
    email: str | None = Field(None, description="Verified GitHub email address")
    avatar_url: str | None = Field(None, description="GitHub avatar URL")
    profile_url: str | None = Field(None, description="GitHub profile URL")


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.auth_token_cookie_name,
        token,
        max_age=settings.session_ttl,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )


def _validate_extension_redirect_url(value: str | None) -> str | None:
    """Allow only browser-extension redirect URLs for extension OAuth completion."""
    if not value:
        return None

    parsed = urllib.parse.urlparse(value)
    is_chrome_extension_url = parsed.scheme == "chrome-extension" and bool(parsed.netloc)
    is_chrome_identity_url = (
        parsed.scheme == "https"
        and parsed.netloc.endswith(".chromiumapp.org")
        and bool(parsed.path.strip("/"))
    )
    if not is_chrome_extension_url and not is_chrome_identity_url:
        raise HTTPException(status_code=400, detail="Invalid extension redirect URL")
    return value


@router.get("/login", response_model=GitHubLoginResponse)
async def github_login(
    extension_redirect_url: str | None = Query(None),
):
    """Start the GitHub OAuth login flow and return the authorization URL.

    The extension should call this endpoint, then launch the returned URL with
    the browser identity API. The backend embeds a short-lived signed state in
    the GitHub URL and handles the callback exchange itself.
    """
    if (
        not settings.github_client_id
        or not settings.github_client_secret
        or not settings.github_oauth_callback_url
    ):
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")

    validated_redirect_url = _validate_extension_redirect_url(extension_redirect_url)
    state = create_oauth_state(validated_redirect_url)

    return GitHubLoginResponse(authorization_url=build_github_authorization_url(state))


@router.get("/callback")
async def github_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
) -> Any:
    """Handle the GitHub OAuth callback and issue an application session token.

    Existing GitHub users are updated and logged in. First-time GitHub users are
    inserted before the JWT and HTTP-only cookie are issued.
    """
    if error:
        raise HTTPException(status_code=400, detail=f"GitHub authentication failed: {error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing GitHub authorization code")

    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")

    try:
        state_payload = decode_oauth_state(state)
        access_token = await asyncio.to_thread(exchange_code_for_access_token, code)
        profile = await asyncio.to_thread(fetch_github_user, access_token)
        emails = await asyncio.to_thread(fetch_github_user_emails, access_token)
        normalized_profile = normalize_github_profile(profile, emails)
        user = await upsert_github_user(normalized_profile, access_token)
    except GitHubOAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = create_access_token(
        {
            "sub": str(user["github_id"]),
            "login": user["login"],
            "name": user.get("name"),
            "email": user.get("email"),
            "avatar_url": user.get("avatar_url"),
            "profile_url": user.get("profile_url"),
        }
    )

    validated_redirect_url = _validate_extension_redirect_url(
        state_payload.get("extension_redirect_url")
    )
    if validated_redirect_url:
        redirect_url = f"{validated_redirect_url}#access_token={urllib.parse.quote(token)}&token_type=bearer"
        redirect_response = RedirectResponse(redirect_url, status_code=303)
        _set_auth_cookie(redirect_response, token)
        return redirect_response

    auth_response = HTMLResponse(
        content=(
            "<!doctype html><html><head><title>Code Analytics</title></head>"
            "<body><h1>GitHub authentication complete</h1>"
            "<p>You can close this tab and return to the Code Analytics extension.</p>"
            "</body></html>"
        ),
        status_code=200,
    )
    _set_auth_cookie(auth_response, token)
    return auth_response


@router.get("/user", response_model=CurrentUserResponse)
async def get_current_user_profile(current_user=Depends(get_current_user)) -> CurrentUserResponse:
    """Return the currently authenticated user's profile."""
    return current_user


@router.post("/logout", status_code=204)
async def logout(response: Response):
    """Clear authentication cookies and end the user session."""
    response.delete_cookie(settings.auth_token_cookie_name, path="/")
    response.status_code = 204
    return response
