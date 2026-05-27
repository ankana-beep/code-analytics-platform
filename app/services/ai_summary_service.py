"""OpenAI-backed repository summary generation with caching and rate limiting."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

import aiohttp

from app.core.cache import cache_manager
from app.core.config import settings
from app.core.logging import logger


class AISummaryError(Exception):
    """Raised when an AI summary cannot be generated."""


class AISummaryRateLimitError(AISummaryError):
    """Raised when a caller exceeds the allowed AI summary request rate."""

    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__(f"AI summary rate limit reached. Try again in about {retry_after} seconds.")


_IN_MEMORY_RATE_LIMITS: dict[str, tuple[int, datetime]] = {}

_SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "headline": {"type": "string"},
        "plain_english_summary": {"type": "string"},
        "technical_summary": {"type": "string"},
        "risk_level": {"type": "string", "enum": ["low", "medium", "high"]},
        "key_strengths": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 4,
        },
        "priority_concerns": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 4,
        },
        "quick_wins": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 4,
        },
        "confidence_note": {"type": "string"},
    },
    "required": [
        "headline",
        "plain_english_summary",
        "technical_summary",
        "risk_level",
        "key_strengths",
        "priority_concerns",
        "quick_wins",
        "confidence_note",
    ],
}


class OpenAIRepositorySummaryService:
    """Generate concise repository summaries for technical and non-technical readers."""

    async def generate_summary(self, scan: dict[str, Any], rate_limit_key: str) -> tuple[dict[str, Any], bool]:
        """Return a cached summary when available, otherwise generate a new one."""
        scan_id = str(scan.get("id") or "")
        cached = scan.get("ai_summary")
        if isinstance(cached, dict) and cached.get("headline"):
            return cached, True

        if scan_id and cache_manager.client is not None:
            cached = await cache_manager.get_json(f"ai-summary:{scan_id}")
            if isinstance(cached, dict) and cached.get("headline"):
                return cached, True

        await self._enforce_rate_limit(rate_limit_key)
        summary = await self._request_summary(scan)
        if scan_id and cache_manager.client is not None:
            await cache_manager.set_json(
                f"ai-summary:{scan_id}",
                summary,
                ttl_seconds=settings.ai_summary_cache_ttl_seconds,
            )
        return summary, False

    async def _enforce_rate_limit(self, rate_limit_key: str) -> None:
        limit = settings.ai_summary_rate_limit_requests
        window = settings.ai_summary_rate_limit_window_seconds
        retry_after = window

        if cache_manager.client is not None:
            current = await cache_manager.client.incr(rate_limit_key)
            if current == 1:
                await cache_manager.client.expire(rate_limit_key, window)
            if current > limit:
                ttl = await cache_manager.client.ttl(rate_limit_key)
                raise AISummaryRateLimitError(max(int(ttl), 1) if ttl and ttl > 0 else retry_after)
            return

        now = datetime.utcnow()
        count, reset_at = _IN_MEMORY_RATE_LIMITS.get(rate_limit_key, (0, now + timedelta(seconds=window)))
        if now >= reset_at:
            count = 0
            reset_at = now + timedelta(seconds=window)
        count += 1
        _IN_MEMORY_RATE_LIMITS[rate_limit_key] = (count, reset_at)
        if count > limit:
            remaining = max(int((reset_at - now).total_seconds()), 1)
            raise AISummaryRateLimitError(remaining)

    async def _request_summary(self, scan: dict[str, Any]) -> dict[str, Any]:
        if not settings.openai_api_key:
            raise AISummaryError("AI summaries are not configured on the server.")

        payload = {
            "model": settings.openai_summary_model,
            "input": [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": self._user_prompt(scan)},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "repository_ai_summary",
                    "strict": True,
                    "schema": _SUMMARY_SCHEMA,
                }
            },
        }

        timeout = aiohttp.ClientTimeout(total=settings.openai_timeout_seconds)
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{settings.openai_base_url.rstrip('/')}/responses",
                    headers=headers,
                    json=payload,
                ) as response:
                    raw_text = await response.text()
                    body = json.loads(raw_text) if raw_text else {}
                    if response.status >= 400:
                        detail = self._extract_error_detail(body)
                        raise AISummaryError(detail or f"OpenAI request failed with status {response.status}")
        except aiohttp.ClientError as exc:
            raise AISummaryError("Unable to reach OpenAI to generate the repository summary.") from exc
        except json.JSONDecodeError as exc:
            raise AISummaryError("OpenAI returned an invalid response payload.") from exc

        try:
            output_text = body.get("output_text") or self._extract_output_text(body)
            summary = json.loads(output_text)
        except (TypeError, json.JSONDecodeError) as exc:
            logger.error("Failed to parse AI summary response", extra={"scan_id": scan.get("id")})
            raise AISummaryError("OpenAI returned a summary in an unexpected format.") from exc

        return {
            **summary,
            "scan_id": scan.get("id"),
            "repository_name": scan.get("repository_name"),
            "branch": scan.get("branch"),
            "model": settings.openai_summary_model,
            "generated_at": datetime.utcnow().isoformat(),
        }

    def _system_prompt(self) -> str:
        return (
            "You are a senior engineering analyst creating repository health summaries for a mixed audience. "
            "Some readers are non-technical stakeholders, so explain the practical meaning of the code health in plain English. "
            "Other readers are engineers, so keep one short technical section grounded in the scan data. "
            "Be accurate, do not invent facts, and do not mention any metrics that are missing from the input. "
            "Keep every field concise: one short headline, two to four short sentences for each summary paragraph, "
            "and short bullet-style items for strengths, concerns, and quick wins. "
            "Focus on what matters most now: maintainability, quality risks, testing signals, dependency concerns, and next actions."
        )

    def _user_prompt(self, scan: dict[str, Any]) -> str:
        metrics = scan.get("metrics") or {}
        issues = scan.get("issues") or []
        dependency_summary = scan.get("dependency_summary") or {}
        manager_report = scan.get("manager_report") or {}

        summary_input = {
            "repository_name": scan.get("repository_name"),
            "repository_url": scan.get("repository_path"),
            "branch": scan.get("branch"),
            "health_score": scan.get("health_score"),
            "health_status": scan.get("health_status"),
            "scan_status": scan.get("status"),
            "top_level_metrics": {
                "total_files": metrics.get("total_files"),
                "total_folders": metrics.get("total_folders"),
                "code_lines": metrics.get("code_lines") or metrics.get("total_lines_of_code"),
                "todo_count": metrics.get("todo_count"),
                "fixme_count": metrics.get("fixme_count"),
                "commented_out_code": metrics.get("commented_out_code"),
                "console_logs": metrics.get("console_logs"),
                "debugger_statements": metrics.get("debugger_statements"),
            },
            "complexity_metrics": metrics.get("complexity_metrics") or {},
            "test_metrics": metrics.get("test_metrics") or {},
            "dependency_summary": {
                "has_package_json": dependency_summary.get("has_package_json"),
                "total_dependencies": dependency_summary.get("total_dependencies"),
                "total_dev_dependencies": dependency_summary.get("total_dev_dependencies"),
                "possibly_unused": (dependency_summary.get("possibly_unused") or [])[:10],
            },
            "risk_categories": (manager_report.get("risk_categories") or [])[:5],
            "release_readiness": manager_report.get("release_readiness") or {},
            "top_risky_modules": (manager_report.get("top_risky_modules") or [])[:5],
            "suggestions": (scan.get("suggestions") or [])[:6],
            "issues": [
                {
                    "type": issue.get("type"),
                    "severity": issue.get("severity"),
                    "file": issue.get("file"),
                    "message": issue.get("message"),
                }
                for issue in issues[:10]
            ],
        }

        return (
            "Create a repository summary from the scan data below.\n"
            "Requirements:\n"
            "1. plain_english_summary must be understandable by a non-technical stakeholder.\n"
            "2. technical_summary should still be easy to skim for an engineer.\n"
            "3. key_strengths, priority_concerns, and quick_wins must be specific and short.\n"
            "4. risk_level should reflect the overall code health and delivery risk.\n"
            "5. confidence_note should briefly mention that the summary is based on static scan signals, not runtime behavior.\n\n"
            f"Scan data:\n{json.dumps(summary_input, indent=2)}"
        )

    def _extract_output_text(self, body: dict[str, Any]) -> str:
        for item in body.get("output", []):
            for content in item.get("content", []):
                text_value = content.get("text")
                if isinstance(text_value, str) and text_value:
                    return text_value
        raise AISummaryError("OpenAI did not return summary text.")

    def _extract_error_detail(self, body: dict[str, Any]) -> str | None:
        error = body.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message:
                return message
        return None


ai_summary_service = OpenAIRepositorySummaryService()
