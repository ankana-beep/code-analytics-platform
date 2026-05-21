"""Foundation scanner for public GitHub repositories.

This module intentionally keeps storage and execution simple: scans run
synchronously, results live in memory, and public GitHub archives are downloaded
without cloning.
"""
from __future__ import annotations

import json
import re
import shutil
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.services.github_service import GitHubError, parse_github_repository


IGNORED_FOLDERS = {"node_modules", ".git", "dist", "build", "coverage", "vendor"}
SOURCE_EXTENSIONS = {".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".html", ".css", ".scss", ".json"}
CONFIG_FILES = {
    "package.json",
    "tsconfig.json",
    "vite.config.js",
    "next.config.js",
    "webpack.config.js",
    "eslint.config.js",
    ".eslintrc",
    ".prettierrc",
    "requirements.txt",
    "pyproject.toml",
    "pom.xml",
    "build.gradle",
}
DEVOPS_FILES = {
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".dockerignore",
    "Makefile",
    ".env.example",
    ".env.sample",
    ".gitignore",
}
DOC_FILES = {"README.md", "LICENSE", "CONTRIBUTING.md", "CHANGELOG.md"}
YAML_EXTENSIONS = {".yml", ".yaml"}
COMMENT_PREFIXES = ("//", "#", "/*", "*", "*/", "<!--", "-->")
CODE_IN_COMMENT_RE = re.compile(
    r"\b(function|const|let|var|if|for|while|return|class|def|import|from|public|private|console\.log)\b|[;{}=()]"
)
IMPORT_RE = re.compile(
    r"(?:from\s+['\"]([^'\"]+)['\"]|import\s+(?:.+?\s+from\s+)?['\"]([^'\"]+)['\"]|require\(['\"]([^'\"]+)['\"]\))"
)
FUNCTION_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+|\w+\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+\w+|(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+\w+\s*\([^)]*\))"
)


class BasicScannerError(ValueError):
    """Raised when a foundation scan cannot complete."""


def _download_github_archive(owner: str, repo: str, branch: str, destination: Path) -> None:
    encoded_owner = urllib.parse.quote(owner, safe="")
    encoded_repo = urllib.parse.quote(repo, safe="")
    encoded_branch = urllib.parse.quote(branch or "main", safe="")
    archive_url = f"https://api.github.com/repos/{encoded_owner}/{encoded_repo}/tarball/{encoded_branch}"
    archive_path = destination / "repo.tar.gz"

    request = urllib.request.Request(
        archive_url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "code-analytics-platform",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            with archive_path.open("wb") as archive_file:
                shutil.copyfileobj(response, archive_file)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise BasicScannerError("Repository or branch was not found, or it is not public") from exc
        if exc.code == 403:
            raise BasicScannerError("GitHub API rate limit reached. Try again later.") from exc
        raise BasicScannerError(f"GitHub archive request failed with status {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise BasicScannerError("Unable to download repository archive from GitHub") from exc

    with tarfile.open(archive_path, "r:gz") as archive:
        destination_resolved = destination.resolve()
        for member in archive.getmembers():
            target = (destination / member.name).resolve()
            if destination_resolved not in (target, *target.parents):
                raise BasicScannerError(f"Unsafe archive path: {member.name}")
        archive.extractall(destination)

    archive_path.unlink(missing_ok=True)
    roots = [path for path in destination.iterdir() if path.is_dir()]
    if len(roots) == 1:
        root = roots[0]
        for child in root.iterdir():
            shutil.move(str(child), destination / child.name)
        root.rmdir()


def _is_supported_file(path: Path, root: Path) -> bool:
    relative = path.relative_to(root).as_posix()
    if any(part in IGNORED_FOLDERS for part in path.relative_to(root).parts):
        return False
    if path.suffix.lower() in SOURCE_EXTENSIONS or path.suffix.lower() in YAML_EXTENSIONS:
        return True
    if path.name in CONFIG_FILES or path.name in DEVOPS_FILES or path.name in DOC_FILES:
        return True
    return relative.startswith(".github/workflows/") and path.suffix.lower() in YAML_EXTENSIONS


def _line_kind(line: str, suffix: str) -> str:
    stripped = line.strip()
    if not stripped:
        return "blank"
    if suffix in {".html", ".md"} and (stripped.startswith("<!--") or stripped.endswith("-->")):
        return "comment"
    if suffix in {".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".java"}:
        if stripped.startswith(("//", "/*", "*", "*/")):
            return "comment"
    if suffix in {".py", ".yml", ".yaml", ".toml"} and stripped.startswith("#"):
        return "comment"
    return "code"


def _dependency_key(import_name: str) -> str:
    if import_name.startswith("@"):
        parts = import_name.split("/")
        return "/".join(parts[:2])
    return import_name.split("/")[0]


def _detect_long_functions(lines: list[str], suffix: str, threshold: int = 50) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        if not FUNCTION_RE.match(line):
            continue

        if suffix == ".py":
            base_indent = len(line) - len(line.lstrip())
            end = index + 1
            for cursor in range(index + 1, len(lines)):
                current = lines[cursor]
                stripped = current.strip()
                if stripped and (len(current) - len(current.lstrip())) <= base_indent:
                    break
                end = cursor + 1
            length = end - index
        else:
            brace_balance = line.count("{") - line.count("}")
            end = index + 1
            for cursor in range(index + 1, len(lines)):
                brace_balance += lines[cursor].count("{") - lines[cursor].count("}")
                end = cursor + 1
                if brace_balance <= 0 and "{" in line:
                    break
            length = end - index

        if length > threshold:
            issues.append({"line": index + 1, "length": length})
    return issues


def _analyze_file(path: Path, root: Path, declared_dependencies: set[str]) -> tuple[dict[str, Any], list[dict[str, Any]], Counter]:
    relative = path.relative_to(root).as_posix()
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    suffix = path.suffix.lower()
    counts = Counter(_line_kind(line, suffix) for line in lines)
    todo_lines = [i + 1 for i, line in enumerate(lines) if "TODO" in line.upper() or "FIXME" in line.upper()]
    console_lines = [i + 1 for i, line in enumerate(lines) if "console.log" in line]
    debugger_lines = [i + 1 for i, line in enumerate(lines) if re.search(r"\bdebugger\b", line)]
    blank_runs = 0
    current_blank_run = 0
    commented_out_lines = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            current_blank_run += 1
            if current_blank_run == 4:
                blank_runs += 1
        else:
            current_blank_run = 0

        if stripped.startswith(COMMENT_PREFIXES):
            uncommented = re.sub(r"^(//|#|/\*|\*|<!--)\s*", "", stripped).strip()
            if CODE_IN_COMMENT_RE.search(uncommented):
                commented_out_lines.append(i + 1)

    imported = Counter()
    for match in IMPORT_RE.finditer(text):
        import_name = next(group for group in match.groups() if group)
        package = _dependency_key(import_name)
        if package in declared_dependencies:
            imported[package] += 1

    issues: list[dict[str, Any]] = []
    if len(lines) > 300:
        issues.append({"type": "large_file", "severity": "warning", "file": relative, "line": None, "message": f"File has {len(lines)} lines."})
    for item in _detect_long_functions(lines, suffix):
        issues.append({"type": "long_function", "severity": "warning", "file": relative, "line": item["line"], "message": f"Function appears to be {item['length']} lines long."})
    if blank_runs:
        issues.append({"type": "blank_lines", "severity": "info", "file": relative, "line": None, "message": "File contains runs of more than 3 blank lines."})
    for line in console_lines:
        issues.append({"type": "console_log", "severity": "warning", "file": relative, "line": line, "message": "console.log statement found."})
    for line in debugger_lines:
        issues.append({"type": "debugger", "severity": "error", "file": relative, "line": line, "message": "debugger statement found."})
    for line in todo_lines:
        issues.append({"type": "todo_fixme", "severity": "info", "file": relative, "line": line, "message": "TODO/FIXME marker found."})
    for line in commented_out_lines:
        issues.append({"type": "commented_out_code", "severity": "info", "file": relative, "line": line, "message": "Comment looks like disabled code."})

    file_result = {
        "path": relative,
        "extension": path.suffix or path.name,
        "size": path.stat().st_size,
        "total_lines": len(lines),
        "blank_lines": counts["blank"],
        "comment_lines": counts["comment"],
        "code_lines": counts["code"],
        "todo_count": len(todo_lines),
        "fixme_count": sum(1 for line in lines if "FIXME" in line.upper()),
        "console_logs": len(console_lines),
        "debugger_statements": len(debugger_lines),
        "commented_out_code": len(commented_out_lines),
    }
    return file_result, issues, imported


def _load_package_dependencies(root: Path) -> dict[str, Any]:
    package_json = root / "package.json"
    if not package_json.exists():
        return {
            "has_package_json": False,
            "dependencies": [],
            "dev_dependencies": [],
            "total_dependencies": 0,
            "total_dev_dependencies": 0,
            "possibly_unused": [],
        }

    try:
        package = json.loads(package_json.read_text(encoding="utf-8", errors="ignore"))
    except json.JSONDecodeError:
        raise BasicScannerError("package.json exists but could not be parsed")

    dependencies = sorted((package.get("dependencies") or {}).keys())
    dev_dependencies = sorted((package.get("devDependencies") or {}).keys())
    return {
        "has_package_json": True,
        "dependencies": dependencies,
        "dev_dependencies": dev_dependencies,
        "total_dependencies": len(dependencies),
        "total_dev_dependencies": len(dev_dependencies),
        "possibly_unused": [],
    }


def _score_health(metrics: dict[str, Any], issues: list[dict[str, Any]], dependency_summary: dict[str, Any]) -> tuple[int, str]:
    total_lines = max(metrics["total_lines"], 1)
    blank_ratio = metrics["blank_lines"] / total_lines
    issue_counts = Counter(issue["type"] for issue in issues)
    penalty = 0
    penalty += min(issue_counts["large_file"] * 6, 24)
    penalty += min(issue_counts["todo_fixme"] * 2, 18)
    penalty += min((issue_counts["console_log"] + issue_counts["debugger"]) * 4, 20)
    penalty += min(issue_counts["commented_out_code"] * 3, 18)
    if blank_ratio > 0.25:
        penalty += min(round((blank_ratio - 0.25) * 100), 12)
    penalty += min(len(dependency_summary["possibly_unused"]) * 2, 16)
    score = max(0, min(100, 100 - penalty))
    if score >= 80:
        status = "Good"
    elif score >= 60:
        status = "Average"
    else:
        status = "Needs Improvement"
    return score, status


def run_basic_scan(repository_url: str, branch: str = "main") -> dict[str, Any]:
    repository = parse_github_repository(repository_url)
    if not repository:
        raise GitHubError("Enter a valid public GitHub repository URL like https://github.com/owner/repo")

    scan_id = str(uuid4())
    started = time.time()
    temp_dir = Path(tempfile.mkdtemp(prefix="basic-scan-"))

    try:
        _download_github_archive(repository.owner, repository.repo, branch, temp_dir)
        dependency_summary = _load_package_dependencies(temp_dir)
        declared_dependencies = set(dependency_summary["dependencies"]) | set(dependency_summary["dev_dependencies"])
        supported_files = sorted(
            path for path in temp_dir.rglob("*")
            if path.is_file() and _is_supported_file(path, temp_dir)
        )
        folders = {
            path.relative_to(temp_dir).as_posix()
            for path in temp_dir.rglob("*")
            if path.is_dir() and not any(part in IGNORED_FOLDERS for part in path.relative_to(temp_dir).parts)
        }

        file_results: list[dict[str, Any]] = []
        issues: list[dict[str, Any]] = []
        imported_dependencies: Counter = Counter()
        file_types: Counter = Counter()
        folder_stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"files": 0, "lines": 0})

        for path in supported_files:
            file_result, file_issues, imports = _analyze_file(path, temp_dir, declared_dependencies)
            file_results.append(file_result)
            issues.extend(file_issues)
            imported_dependencies.update(imports)
            file_types[file_result["extension"]] += 1
            parent = str(Path(file_result["path"]).parent)
            folder_stats[parent if parent != "." else "root"]["files"] += 1
            folder_stats[parent if parent != "." else "root"]["lines"] += file_result["total_lines"]

        dependency_summary["possibly_unused"] = sorted(
            name for name in declared_dependencies
            if imported_dependencies[name] == 0
        )
        dependency_summary["usage"] = dict(imported_dependencies)

        metrics = {
            "total_files": len(file_results),
            "total_folders": len(folders),
            "total_lines": sum(item["total_lines"] for item in file_results),
            "total_lines_of_code": sum(item["code_lines"] for item in file_results),
            "blank_lines": sum(item["blank_lines"] for item in file_results),
            "total_blank_lines": sum(item["blank_lines"] for item in file_results),
            "comment_lines": sum(item["comment_lines"] for item in file_results),
            "total_comment_lines": sum(item["comment_lines"] for item in file_results),
            "code_lines": sum(item["code_lines"] for item in file_results),
            "file_types": dict(file_types),
            "largest_files": sorted(file_results, key=lambda item: item["total_lines"], reverse=True)[:10],
            "folder_statistics": [
                {"folder_path": folder, "total_files": data["files"], "total_lines": data["lines"], "total_size": 0, "file_types": {}, "avg_complexity": 0}
                for folder, data in sorted(folder_stats.items(), key=lambda item: item[1]["lines"], reverse=True)[:10]
            ],
            "todo_count": sum(item["todo_count"] for item in file_results),
            "fixme_count": sum(item["fixme_count"] for item in file_results),
            "commented_out_code": sum(item["commented_out_code"] for item in file_results),
            "console_logs": sum(item["console_logs"] for item in file_results),
            "debugger_statements": sum(item["debugger_statements"] for item in file_results),
            "total_size": sum(item["size"] for item in file_results),
            "scan_duration": round(time.time() - started, 2),
            "complexity_metrics": {
                "avg_cyclomatic_complexity": 0,
                "max_cyclomatic_complexity": 0,
                "avg_cognitive_complexity": 0,
                "max_cognitive_complexity": 0,
                "avg_maintainability_index": 100,
            },
            "test_metrics": {"total_test_files": 0, "test_coverage_percentage": 0, "tests_per_module": 0},
            "dependencies": [
                {"package_name": name, "usage_count": imported_dependencies[name], "files": []}
                for name in sorted(declared_dependencies)
            ],
            "duplicate_files": [],
            "unused_imports": 0,
            "unused_variables": 0,
            "docstring_coverage": 0,
            "created_at": datetime.utcnow().isoformat(),
        }
        health_score, health_status = _score_health(metrics, issues, dependency_summary)
        suggestions = []
        if metrics["console_logs"] or metrics["debugger_statements"]:
            suggestions.append("Remove console.log and debugger statements before production.")
        if any(issue["type"] == "large_file" for issue in issues):
            suggestions.append("Refactor large files into smaller modules.")
        if metrics["todo_count"] or metrics["fixme_count"]:
            suggestions.append("Review TODO/FIXME comments and convert them into tracked work.")
        if dependency_summary["possibly_unused"]:
            suggestions.append("Remove unused dependencies if confirmed by tests and build output.")
        if metrics["commented_out_code"]:
            suggestions.append("Reduce commented-out code to keep the codebase easier to read.")
        if not suggestions:
            suggestions.append("Keep the current structure healthy with regular scans after meaningful changes.")

        scan = {
            "id": scan_id,
            "_id": scan_id,
            "repository_name": f"{repository.owner}/{repository.repo}",
            "repository_path": repository.html_url,
            "branch": branch,
            "status": "completed",
            "progress": 100,
            "files_processed": len(file_results),
            "files_total": len(file_results),
            "created_at": datetime.utcnow().isoformat(),
            "started_at": datetime.utcfromtimestamp(started).isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "health_score": health_score,
            "health_status": health_status,
            "metrics": metrics,
            "issues": issues,
            "dependency_summary": dependency_summary,
            "suggestions": suggestions,
            "production_later": [
                "Authentication",
                "Private repo scanning",
                "Database",
                "Background queue",
                "AI suggestions",
                "PDF report",
                "Team management",
                "Manager report",
                "Security scanner",
            ],
        }
        return scan
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
