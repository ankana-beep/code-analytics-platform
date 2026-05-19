"""
Analyzer for repository metadata and configuration files.
Captures basic file metrics plus useful dependency hints from common formats.
"""
import hashlib
import json
import re
from pathlib import Path
from typing import List, Optional

import yaml

from app.domain.models import FileMetrics, FileType
from app.core.logging import logger


class ConfigAnalyzer:
    """Lightweight analyzer for config, manifest, docs, and build files."""

    docker_from_pattern = re.compile(r"^\s*FROM\s+([^\s]+)", re.IGNORECASE | re.MULTILINE)
    make_target_pattern = re.compile(r"^[A-Za-z0-9_.-]+:", re.MULTILINE)
    yaml_image_pattern = re.compile(r"^\s*image:\s*['\"]?([^'\"\s]+)", re.IGNORECASE | re.MULTILINE)

    async def analyze_file(self, file_path: Path) -> Optional[FileMetrics]:
        """Analyze a single config-like file."""
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            file_hash = hashlib.sha256(content.encode()).hexdigest()
            lines = content.splitlines()

            metrics = FileMetrics(
                file_path=str(file_path),
                file_type=FileType.OTHER,
                file_hash=file_hash,
                file_size=len(content),
                lines_of_code=self._count_loc(lines),
                comment_lines=self._count_comments(lines),
                blank_lines=self._count_blank_lines(lines),
                dependencies=self._extract_dependencies(file_path, content),
                functions=self._count_declarative_entries(file_path, content),
            )

            metrics.maintainability_index = self._estimate_maintainability(metrics)
            return metrics
        except Exception as e:
            logger.error(f"Failed to analyze {file_path}: {str(e)}")
            return None

    def _count_loc(self, lines: List[str]) -> int:
        return sum(1 for line in lines if line.strip() and not self._is_comment(line))

    def _count_comments(self, lines: List[str]) -> int:
        return sum(1 for line in lines if self._is_comment(line))

    def _count_blank_lines(self, lines: List[str]) -> int:
        return sum(1 for line in lines if not line.strip())

    def _is_comment(self, line: str) -> bool:
        stripped = line.strip()
        return stripped.startswith("#") or stripped.startswith("//")

    def _extract_dependencies(self, file_path: Path, content: str) -> List[str]:
        name = file_path.name.lower()
        suffix = file_path.suffix.lower()

        if name == "package.json":
            return self._extract_package_json_dependencies(content)

        if name.startswith("dockerfile"):
            return self.docker_from_pattern.findall(content)

        if suffix in {".yml", ".yaml"}:
            return self._extract_yaml_dependencies(content)

        return []

    def _extract_package_json_dependencies(self, content: str) -> List[str]:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return []

        dependencies = []
        for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            values = data.get(section, {})
            if isinstance(values, dict):
                dependencies.extend(values.keys())

        return dependencies

    def _extract_yaml_dependencies(self, content: str) -> List[str]:
        dependencies = self.yaml_image_pattern.findall(content)

        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError:
            return dependencies

        if isinstance(data, dict):
            dependencies.extend(self._walk_yaml_images(data))

        return sorted(set(dependencies))

    def _walk_yaml_images(self, value) -> List[str]:
        if isinstance(value, dict):
            images = []
            for key, nested in value.items():
                if key == "image" and isinstance(nested, str):
                    images.append(nested)
                else:
                    images.extend(self._walk_yaml_images(nested))
            return images

        if isinstance(value, list):
            images = []
            for item in value:
                images.extend(self._walk_yaml_images(item))
            return images

        return []

    def _count_declarative_entries(self, file_path: Path, content: str) -> int:
        name = file_path.name.lower()

        if name == "makefile":
            return len(self.make_target_pattern.findall(content))

        if name == "package.json":
            try:
                scripts = json.loads(content).get("scripts", {})
                return len(scripts) if isinstance(scripts, dict) else 0
            except json.JSONDecodeError:
                return 0

        return 0

    def _estimate_maintainability(self, metrics: FileMetrics) -> float:
        if metrics.lines_of_code <= 0:
            return 0.0

        size_penalty = min(metrics.lines_of_code / 20, 35)
        comment_bonus = min((metrics.comment_lines / metrics.lines_of_code) * 15, 15)
        return max(0.0, min(100.0, 100 - size_penalty + comment_bonus))
