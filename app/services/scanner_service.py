"""
Scanner service implementing bounded concurrency and producer-consumer pipeline.
Orchestrates the scanning process with efficient resource utilization.
"""
import asyncio
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import List, Dict, Optional, Set
import time
from collections import defaultdict

from app.domain.models import (
    Scan, ScanStatus, ScanMetrics, FileMetrics, FolderStatistics,
    CodeComplexityMetrics, TestMetrics, DuplicateFile, DependencyInfo
)
from app.repositories.scan_repository import ScanRepository
from app.analyzers.python_analyzer import get_analyzer_for_path
from app.core.config import settings
from app.core.logging import logger
from app.core.redis import RedisManager
from app.core.metrics import metrics as prom_metrics
from app.services.github_service import parse_github_repository


class ScannerService:
    """
    Production-grade scanner service with bounded concurrency.
    
    Implements:
    - Producer-consumer pipeline for efficient file processing
    - Bounded concurrency using asyncio.Semaphore
    - Incremental scanning using file hashes
    - Progress tracking and real-time updates
    - Bulk database operations for performance
    """
    
    def __init__(
        self,
        repository: ScanRepository,
        redis_manager: RedisManager
    ):
        self.repository = repository
        self.redis = redis_manager
        self.semaphore = asyncio.Semaphore(settings.scan_concurrency_limit)
    
    async def scan_repository(
        self,
        scan_id: str,
        repository_path: str,
        branch: str = "main",
        incremental: bool = False
    ) -> bool:
        """
        Execute complete repository scan with progress tracking.
        
        Args:
            scan_id: Scan identifier
            repository_path: Path to repository
            branch: Git branch or remote branch to scan
            incremental: Skip files that have unchanged hashes from a previous scan
            
        Returns:
            True if scan completed successfully
        """
        start_time = time.time()
        
        try:
            # Update scan status
            await self.repository.update_scan(scan_id, {
                "status": ScanStatus.PROCESSING,
                "started_at": time.time()
            })
            
            source_path = Path(repository_path)
            scan_path, cleanup_path = await self._prepare_scan_path(repository_path, branch)

            files: List[Path] = []
            try:
                # Discover files
                logger.info(f"Discovering files in {scan_path}")
                files = await self._discover_files(scan_path)
            finally:
                if cleanup_path is not None and not files:
                    shutil.rmtree(cleanup_path, ignore_errors=True)
            
            if not files:
                await self.repository.fail_scan(scan_id, "No files found")
                return False
            
            # Update total files count
            await self.repository.update_scan(scan_id, {"files_total": len(files)})
            
            try:
                # Check for incremental scan
                previous_hashes = set()
                if incremental:
                    previous_scan = await self.repository.get_previous_scan(repository_path, branch)
                    previous_hashes = await self._get_previous_file_hashes(previous_scan) if previous_scan else set()
                
                # Producer-consumer pipeline
                logger.info(f"Starting scan pipeline for {len(files)} files")
                file_metrics = await self._process_files_pipeline(
                    scan_id,
                    files,
                    previous_hashes
                )
                
                file_metrics = self._normalize_file_paths(file_metrics, scan_path, repository_path)

                # Bulk insert file metrics
                logger.info(f"Inserting {len(file_metrics)} file metrics")
                await self.repository.bulk_insert_file_metrics(scan_id, file_metrics)
                
                # Aggregate metrics
                logger.info("Aggregating scan metrics")
                scan_metrics = await self._aggregate_metrics(
                    scan_id,
                    repository_path,
                    file_metrics,
                    files
                )
                
                # Complete scan
                await self.repository.complete_scan(scan_id, scan_metrics)
            finally:
                if cleanup_path is not None:
                    shutil.rmtree(cleanup_path, ignore_errors=True)
            
            # Record metrics
            duration = time.time() - start_time
            prom_metrics.record_scan("completed", duration, repository_path, len(files))
            
            logger.info(
                "Scan completed successfully",
                extra={
                    "scan_id": scan_id,
                    "duration": duration,
                    "files": len(files)
                }
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Scan failed: {str(e)}", exc_info=True)
            await self.repository.fail_scan(scan_id, str(e))
            prom_metrics.record_error("scan_failed")
            return False

    async def _prepare_scan_path(self, repository_path: str, branch: str) -> tuple[Path, Optional[Path]]:
        """Return a filesystem path containing the requested branch contents."""
        github_repo = parse_github_repository(repository_path)
        if github_repo:
            temp_dir = Path(tempfile.mkdtemp(prefix="scan-github-"))
            await asyncio.to_thread(self._download_github_archive, github_repo.owner, github_repo.repo, branch, temp_dir)
            return temp_dir, temp_dir

        local_path = Path(repository_path)
        if not branch or not (local_path / ".git").exists():
            return local_path, None

        ref = await asyncio.to_thread(self._resolve_git_ref, local_path, branch)
        if not ref:
            raise ValueError(f"Branch '{branch}' was not found in {local_path}")

        current_ref = await asyncio.to_thread(self._resolve_git_ref, local_path, "HEAD")
        if ref == current_ref:
            return local_path, None

        temp_dir = Path(tempfile.mkdtemp(prefix="scan-branch-"))
        await asyncio.to_thread(self._export_git_ref, local_path, ref, temp_dir)

        logger.info(
            "Prepared branch scan path",
            extra={
                "repository": str(local_path),
                "branch": branch,
                "ref": ref,
                "scan_path": str(temp_dir)
            }
        )

        return temp_dir, temp_dir

    def _download_github_archive(self, owner: str, repo: str, branch: str, destination: Path) -> None:
        """Download a public GitHub repository branch archive without cloning."""
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
                raise ValueError("GitHub repository or branch was not found, or it is not public") from exc
            if exc.code == 403:
                raise ValueError("GitHub API rate limit reached. Try again later.") from exc
            raise ValueError(f"GitHub archive request failed with status {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise ValueError("Unable to download repository archive from GitHub") from exc

        with tarfile.open(archive_path, "r:gz") as archive:
            self._safe_extract_archive(archive, destination)

        archive_path.unlink(missing_ok=True)

        extracted_roots = [path for path in destination.iterdir() if path.is_dir()]
        if len(extracted_roots) == 1:
            root = extracted_roots[0]
            for child in root.iterdir():
                shutil.move(str(child), destination / child.name)
            root.rmdir()

        logger.info(
            "Downloaded GitHub branch archive",
            extra={
                "repository": f"{owner}/{repo}",
                "branch": branch,
                "scan_path": str(destination),
            }
        )

    def _resolve_git_ref(self, repository_path: Path, branch: str) -> Optional[str]:
        """Resolve a branch name to a commit SHA, including origin/<branch>."""
        candidates = [branch]
        if not branch.startswith("origin/"):
            candidates.extend([f"origin/{branch}", f"refs/heads/{branch}", f"refs/remotes/origin/{branch}"])

        for candidate in candidates:
            result = subprocess.run(
                [
                    "git",
                    "-c",
                    f"safe.directory={repository_path}",
                    "-C",
                    str(repository_path),
                    "rev-parse",
                    "--verify",
                    f"{candidate}^{{commit}}"
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                return result.stdout.strip()

        return None

    def _export_git_ref(self, repository_path: Path, ref: str, destination: Path) -> None:
        """Export a git ref to a temporary directory without modifying the source worktree."""
        archive_path = destination / "repo.tar"
        with archive_path.open("wb") as archive_file:
            result = subprocess.run(
                [
                    "git",
                    "-c",
                    f"safe.directory={repository_path}",
                    "-C",
                    str(repository_path),
                    "archive",
                    "--format=tar",
                    ref
                ],
                stdout=archive_file,
                stderr=subprocess.PIPE,
                check=False,
            )

        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode("utf-8", errors="ignore") or "Failed to export git branch")

        with tarfile.open(archive_path) as archive:
            self._safe_extract_archive(archive, destination)

        archive_path.unlink(missing_ok=True)

    def _safe_extract_archive(self, archive: tarfile.TarFile, destination: Path) -> None:
        """Extract a tar archive while preventing paths from escaping destination."""
        destination_resolved = destination.resolve()
        for member in archive.getmembers():
            target = (destination / member.name).resolve()
            if destination_resolved not in (target, *target.parents):
                raise RuntimeError(f"Unsafe archive path: {member.name}")

        archive.extractall(destination)

    def _normalize_file_paths(
        self,
        file_metrics: List[FileMetrics],
        scan_path: Path,
        repository_path: str
    ) -> List[FileMetrics]:
        """Map temporary branch export file paths back to the requested repository path."""
        repository_ref = parse_github_repository(repository_path)
        local_path = Path(repository_path)

        if not repository_ref and scan_path == local_path:
            return file_metrics

        for metric in file_metrics:
            try:
                relative_path = Path(metric.file_path).relative_to(scan_path)
                if repository_ref:
                    relative = relative_path.as_posix()
                    metric.file_path = f"{repository_ref.html_url}/{relative}"
                else:
                    metric.file_path = str(local_path / relative_path)
            except ValueError:
                pass

        return file_metrics
    
    async def _discover_files(self, repo_path: Path) -> List[Path]:
        """
        Discover all supported files in repository.
        
        Args:
            repo_path: Repository root path
            
        Returns:
            List of file paths to scan
        """
        files = []
        
        # Walk directory tree
        for file_path in repo_path.rglob('*'):
            # Skip if not a file
            if not file_path.is_file():
                continue
            
            # Skip hidden files and directories
            if any(part.startswith('.') for part in file_path.parts):
                continue
            
            # Check file extension or exact filename for files like Dockerfile/Makefile.
            if not self._is_supported_file(file_path):
                continue
            
            # Check file size
            try:
                if file_path.stat().st_size > settings.scan_max_file_size:
                    logger.warning(f"Skipping large file: {file_path}")
                    continue
            except OSError:
                continue
            
            files.append(file_path)
        
        return files

    def _is_supported_file(self, file_path: Path) -> bool:
        """Return whether a file should be included in scanning."""
        return (
            file_path.suffix.lower() in settings.allowed_extensions
            or file_path.name in settings.allowed_filenames
        )
    
    async def _get_previous_file_hashes(self, previous_scan: Scan) -> Set[str]:
        """Get file hashes from previous scan for incremental scanning."""
        if not previous_scan or not previous_scan.id:
            return set()
        
        # Fetch file metrics from previous scan
        file_metrics = await self.repository.get_file_metrics(
            previous_scan.id,
            limit=10000  # Reasonable limit for hash comparison
        )
        
        return {metric.file_hash for metric in file_metrics}
    
    async def _process_files_pipeline(
        self,
        scan_id: str,
        files: List[Path],
        previous_hashes: Set[str]
    ) -> List[FileMetrics]:
        """
        Process files using producer-consumer pipeline with bounded concurrency.
        
        Args:
            scan_id: Scan identifier
            files: List of files to process
            previous_hashes: Set of file hashes from previous scan
            
        Returns:
            List of file metrics
        """
        # Create queue for producer-consumer pattern
        queue = asyncio.Queue(maxsize=settings.scan_chunk_size)
        results = []
        results_lock = asyncio.Lock()
        
        # Progress tracking
        progress_tracker = {
            'processed': 0,
            'total': len(files)
        }
        
        # Producer: Add files to queue
        async def producer():
            for file_path in files:
                await queue.put(file_path)
            
            # Signal completion
            for _ in range(settings.worker_concurrency):
                await queue.put(None)
        
        # Consumer: Process files from queue
        async def consumer():
            while True:
                file_path = await queue.get()
                
                if file_path is None:
                    break
                
                # Process file with bounded concurrency
                async with self.semaphore:
                    metrics = await self._analyze_file(file_path)
                    
                    if metrics:
                        # Skip if file hasn't changed (incremental scan)
                        if metrics.file_hash not in previous_hashes:
                            async with results_lock:
                                results.append(metrics)
                    
                    # Update progress
                    progress_tracker['processed'] += 1
                    
                    # Publish progress every 10 files
                    if progress_tracker['processed'] % 10 == 0:
                        await self._publish_progress(
                            scan_id,
                            progress_tracker['processed'],
                            progress_tracker['total'],
                            str(file_path)
                        )
                
                queue.task_done()
        
        # Start producer
        producer_task = asyncio.create_task(producer())
        
        # Start consumers
        consumer_tasks = [
            asyncio.create_task(consumer())
            for _ in range(settings.worker_concurrency)
        ]
        
        # Wait for completion
        await producer_task
        await asyncio.gather(*consumer_tasks)
        
        return results
    
    async def _analyze_file(self, file_path: Path) -> Optional[FileMetrics]:
        """
        Analyze a single file using appropriate analyzer.
        
        Args:
            file_path: Path to file
            
        Returns:
            FileMetrics or None
        """
        try:
            # Get analyzer for file type
            analyzer_class = get_analyzer_for_path(file_path)
            
            if not analyzer_class:
                return None
            
            # Analyze file
            analyzer = analyzer_class()
            metrics = await analyzer.analyze_file(file_path)
            
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to analyze {file_path}: {str(e)}")
            return None
    
    async def _publish_progress(
        self,
        scan_id: str,
        processed: int,
        total: int,
        current_file: str
    ):
        """Publish scan progress for real-time updates."""
        progress = (processed / total) * 100 if total > 0 else 0
        
        # Update database
        await self.repository.update_scan_progress(
            scan_id,
            progress,
            processed,
            current_file
        )
        
        # Publish to Redis for WebSocket
        await self.redis.publish_progress(scan_id, {
            "scan_id": scan_id,
            "progress": progress,
            "files_processed": processed,
            "files_total": total,
            "current_file": current_file
        })
    
    async def _aggregate_metrics(
        self,
        scan_id: str,
        repository_path: str,
        file_metrics: List[FileMetrics],
        all_files: List[Path]
    ) -> ScanMetrics:
        """
        Aggregate metrics from all analyzed files.
        
        Args:
            scan_id: Scan identifier
            repository_path: Repository path
            file_metrics: List of file metrics
            all_files: All discovered files
            
        Returns:
            Aggregated ScanMetrics
        """
        metrics = ScanMetrics(
            scan_id=scan_id,
            repository_path=repository_path
        )
        
        # File type distribution
        file_types = defaultdict(int)
        for file_path in all_files:
            file_types[file_path.suffix] += 1
        metrics.file_types = dict(file_types)
        
        # Basic statistics
        metrics.total_files = len(file_metrics)
        metrics.total_lines_of_code = sum(m.lines_of_code for m in file_metrics)
        metrics.total_comment_lines = sum(m.comment_lines for m in file_metrics)
        metrics.total_blank_lines = sum(m.blank_lines for m in file_metrics)
        metrics.total_size = sum(m.file_size for m in file_metrics)
        
        # Complexity metrics
        if file_metrics:
            complexities = [m.cyclomatic_complexity for m in file_metrics if m.cyclomatic_complexity > 0]
            cognitive = [m.cognitive_complexity for m in file_metrics if m.cognitive_complexity > 0]
            maintainability = [m.maintainability_index for m in file_metrics if m.maintainability_index > 0]
            
            metrics.complexity_metrics = CodeComplexityMetrics(
                avg_cyclomatic_complexity=sum(complexities) / len(complexities) if complexities else 0,
                max_cyclomatic_complexity=max(complexities) if complexities else 0,
                avg_cognitive_complexity=sum(cognitive) / len(cognitive) if cognitive else 0,
                max_cognitive_complexity=max(cognitive) if cognitive else 0,
                avg_maintainability_index=sum(maintainability) / len(maintainability) if maintainability else 0
            )
        
        # Docstring coverage
        total_documentable = sum(
            m.functions + m.classes + m.methods
            for m in file_metrics
        )
        if total_documentable > 0:
            weighted_coverage = sum(
                m.docstring_coverage * (m.functions + m.classes + m.methods)
                for m in file_metrics
            )
            metrics.docstring_coverage = weighted_coverage / total_documentable
        
        # Issue counts
        metrics.todo_count = sum(m.todo_count for m in file_metrics)
        metrics.fixme_count = sum(m.fixme_count for m in file_metrics)
        
        # Test metrics
        test_files = [m for m in file_metrics if m.has_tests]
        metrics.test_metrics = TestMetrics(
            total_test_files=len(test_files),
            tests_per_module=len(test_files) / len(file_metrics) if file_metrics else 0
        )
        
        # Dependency analysis
        metrics.dependencies = self._analyze_dependencies(file_metrics)
        
        # Duplicate detection
        metrics.duplicate_files = self._find_duplicates(file_metrics)
        
        # Folder statistics
        metrics.folder_statistics = self._calculate_folder_stats(file_metrics)
        
        return metrics
    
    def _analyze_dependencies(
        self,
        file_metrics: List[FileMetrics]
    ) -> List[DependencyInfo]:
        """Analyze and aggregate dependencies across files."""
        dep_map = defaultdict(lambda: {'count': 0, 'files': set()})
        
        for metric in file_metrics:
            for dep in metric.dependencies:
                dep_map[dep]['count'] += 1
                dep_map[dep]['files'].add(metric.file_path)
        
        dependencies = [
            DependencyInfo(
                package_name=name,
                usage_count=data['count'],
                files=list(data['files'])
            )
            for name, data in dep_map.items()
        ]
        
        # Sort by usage count
        dependencies.sort(key=lambda x: x.usage_count, reverse=True)
        
        return dependencies[:100]  # Top 100 dependencies
    
    def _find_duplicates(
        self,
        file_metrics: List[FileMetrics]
    ) -> List[DuplicateFile]:
        """Find duplicate files based on content hash."""
        hash_map = defaultdict(list)
        
        for metric in file_metrics:
            hash_map[metric.file_hash].append(metric.file_path)
        
        duplicates = [
            DuplicateFile(
                file_hash=file_hash,
                file_paths=paths,
                file_size=next(
                    m.file_size
                    for m in file_metrics
                    if m.file_hash == file_hash
                )
            )
            for file_hash, paths in hash_map.items()
            if len(paths) > 1
        ]
        
        return duplicates
    
    def _calculate_folder_stats(
        self,
        file_metrics: List[FileMetrics]
    ) -> List[FolderStatistics]:
        """Calculate statistics per folder."""
        folder_map = defaultdict(lambda: {
            'files': 0,
            'lines': 0,
            'size': 0,
            'types': defaultdict(int)
        })
        
        for metric in file_metrics:
            folder = str(Path(metric.file_path).parent)
            folder_map[folder]['files'] += 1
            folder_map[folder]['lines'] += metric.lines_of_code
            folder_map[folder]['size'] += metric.file_size
            folder_map[folder]['types'][metric.file_type.value] += 1
        
        folder_stats = [
            FolderStatistics(
                folder_path=folder,
                total_files=data['files'],
                total_lines=data['lines'],
                total_size=data['size'],
                file_types=dict(data['types'])
            )
            for folder, data in folder_map.items()
        ]
        
        # Sort by line count
        folder_stats.sort(key=lambda x: x.total_lines, reverse=True)
        
        return folder_stats[:50]  # Top 50 folders
