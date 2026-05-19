"""
JavaScript and TypeScript source analyzer.
Extracts lightweight metrics without requiring a Node parser at runtime.
"""
import hashlib
import re
from pathlib import Path
from typing import List, Optional

from app.domain.models import FileMetrics, FileType
from app.core.logging import logger


class JavaScriptAnalyzer:
    """Heuristic analyzer for JavaScript and TypeScript source files."""

    import_pattern = re.compile(
        r"(?:import\s+(?:.+?\s+from\s+)?[\"']([^\"']+)[\"']|"
        r"require\(\s*[\"']([^\"']+)[\"']\s*\))"
    )
    function_pattern = re.compile(
        r"\b(?:async\s+)?function\s+\w+\s*\(|"
        r"\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|"
        r"\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?[^=;]+=>"
    )
    method_pattern = re.compile(r"^\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{", re.MULTILINE)
    class_pattern = re.compile(r"\bclass\s+[A-Za-z_$][\w$]*")
    todo_pattern = re.compile(r"//\s*TODO:?\s*(.+)|/\*\s*TODO:?\s*(.+?)\*/", re.IGNORECASE | re.DOTALL)
    fixme_pattern = re.compile(r"//\s*FIXME:?\s*(.+)|/\*\s*FIXME:?\s*(.+?)\*/", re.IGNORECASE | re.DOTALL)
    complexity_pattern = re.compile(r"\b(if|for|while|case|catch)\b|\?|\&\&|\|\|")

    async def analyze_file(self, file_path: Path) -> Optional[FileMetrics]:
        """Analyze a single JavaScript or TypeScript file."""
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            file_hash = hashlib.sha256(content.encode()).hexdigest()
            lines = content.splitlines()
            file_type = self._get_file_type(file_path)

            metrics = FileMetrics(
                file_path=str(file_path),
                file_type=file_type,
                file_hash=file_hash,
                file_size=len(content),
                lines_of_code=self._count_loc(lines),
                comment_lines=self._count_comments(lines),
                blank_lines=self._count_blank_lines(lines),
                functions=len(self.function_pattern.findall(content)),
                classes=len(self.class_pattern.findall(content)),
                methods=len(self.method_pattern.findall(content)),
                dependencies=self._extract_dependencies(content),
                todo_count=len(self.todo_pattern.findall(content)),
                fixme_count=len(self.fixme_pattern.findall(content)),
                has_tests=self._is_test_file(file_path),
            )

            metrics.cyclomatic_complexity = self._calculate_complexity(content)
            metrics.cognitive_complexity = metrics.cyclomatic_complexity
            metrics.maintainability_index = self._estimate_maintainability(metrics)
            metrics.docstring_coverage = self._calculate_doc_coverage(content, metrics)

            return metrics
        except Exception as e:
            logger.error(f"Failed to analyze {file_path}: {str(e)}")
            return None

    def _get_file_type(self, file_path: Path) -> FileType:
        if file_path.suffix in {".ts", ".tsx"}:
            return FileType.TYPESCRIPT
        return FileType.JAVASCRIPT

    def _count_loc(self, lines: List[str]) -> int:
        loc = 0
        in_block_comment = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            if in_block_comment:
                if "*/" in stripped:
                    in_block_comment = False
                    stripped = stripped.split("*/", 1)[1].strip()
                else:
                    continue

            if stripped.startswith("/*"):
                if "*/" not in stripped:
                    in_block_comment = True
                continue

            if stripped.startswith("//"):
                continue

            loc += 1

        return loc

    def _count_comments(self, lines: List[str]) -> int:
        count = 0
        in_block_comment = False

        for line in lines:
            stripped = line.strip()

            if in_block_comment:
                count += 1
                if "*/" in stripped:
                    in_block_comment = False
                continue

            if stripped.startswith("//"):
                count += 1
            elif stripped.startswith("/*"):
                count += 1
                if "*/" not in stripped:
                    in_block_comment = True

        return count

    def _count_blank_lines(self, lines: List[str]) -> int:
        return sum(1 for line in lines if not line.strip())

    def _extract_dependencies(self, content: str) -> List[str]:
        dependencies = []
        for match in self.import_pattern.findall(content):
            dependency = match[0] or match[1]
            if dependency:
                dependencies.append(dependency.split("/")[0] if not dependency.startswith(".") else dependency)
        return dependencies

    def _calculate_complexity(self, content: str) -> int:
        return max(1, len(self.complexity_pattern.findall(content)))

    def _estimate_maintainability(self, metrics: FileMetrics) -> float:
        if metrics.lines_of_code <= 0:
            return 0.0

        complexity_penalty = min(metrics.cyclomatic_complexity * 2, 40)
        size_penalty = min(metrics.lines_of_code / 20, 30)
        comment_bonus = min((metrics.comment_lines / metrics.lines_of_code) * 20, 20)
        return max(0.0, min(100.0, 100 - complexity_penalty - size_penalty + comment_bonus))

    def _calculate_doc_coverage(self, content: str, metrics: FileMetrics) -> float:
        total_documentable = metrics.functions + metrics.classes + metrics.methods
        if total_documentable == 0:
            return 0.0

        jsdoc_blocks = len(re.findall(r"/\*\*[\s\S]*?\*/", content))
        return min(100.0, (jsdoc_blocks / total_documentable) * 100)

    def _is_test_file(self, file_path: Path) -> bool:
        name = file_path.name.lower()
        parts = {part.lower() for part in file_path.parts}
        return (
            ".test." in name
            or ".spec." in name
            or name.endswith(".test.js")
            or name.endswith(".spec.js")
            or "tests" in parts
            or "__tests__" in parts
        )
