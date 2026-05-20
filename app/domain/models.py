"""
Domain models for scans, files, and code metrics.
Uses Pydantic for data validation and serialization.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class ScanStatus(str, Enum):
    """Scan status enumeration."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FileType(str, Enum):
    """File type enumeration."""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    JAVA = "java"
    GO = "go"
    RUBY = "ruby"
    PHP = "php"
    OTHER = "other"


class ScanRequest(BaseModel):
    """Request model for initiating a new scan."""
    repository_path: str = Field(..., description="Path to the repository to scan")
    branch: Optional[str] = Field(default="main", description="Git branch or commit ref to scan")
    incremental: bool = Field(default=False, description="Enable incremental scanning")
    analyzers: Optional[List[str]] = Field(default=None, description="List of analyzers to run")
    saved_repository_id: Optional[str] = Field(default=None, description="Saved repository identifier")


class SavedRepositoryCreate(BaseModel):
    """Request model for saving a repository."""
    name: str
    repository_path: str
    default_branch: str = "main"
    team_name: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class SavedRepositoryUpdate(BaseModel):
    """Request model for updating a saved repository."""
    name: Optional[str] = None
    repository_path: Optional[str] = None
    default_branch: Optional[str] = None
    team_name: Optional[str] = None
    labels: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class SavedRepository(BaseModel):
    """Repository saved by a user or team."""
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    name: str
    repository_path: str
    default_branch: str = "main"
    team_name: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "json_encoders": {
            datetime: lambda v: v.isoformat()
        }
    }


class ScanComparisonMetric(BaseModel):
    """Metric delta between two scans."""
    metric: str
    base_value: float
    target_value: float
    delta: float
    delta_percent: Optional[float] = None


class ScanComparison(BaseModel):
    """Comparison response for two completed scans."""
    base_scan_id: str
    target_scan_id: str
    repository_path: str
    base_branch: str
    target_branch: str
    metrics: List[ScanComparisonMetric]


class ShareReportResponse(BaseModel):
    """Response after creating a shareable report."""
    scan_id: str
    share_token: str
    api_url: str


class ExecutiveSummary(BaseModel):
    """Portfolio-level executive summary."""
    total_scans: int
    completed_scans: int
    failed_scans: int
    active_scans: int
    repositories_scanned: int
    total_files: int
    total_lines_of_code: int
    avg_complexity: float
    avg_doc_coverage: float
    total_todos: int
    total_fixmes: int
    total_dependencies: int
    avg_scan_duration: float


class User(BaseModel):
    """Authenticated user account."""
    id: Optional[str] = Field(default=None, alias="_id")
    email: str
    full_name: Optional[str] = None
    password_hash: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None

    model_config = {
        "populate_by_name": True,
        "json_encoders": {
            datetime: lambda v: v.isoformat()
        }
    }


class UserCreate(BaseModel):
    """Request model for email/password registration."""
    email: str
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    """Request model for email/password login."""
    email: str
    password: str


class UserPublic(BaseModel):
    """Public user profile returned to clients."""
    id: str
    email: str
    full_name: Optional[str] = None


class UserUpdate(BaseModel):
    """Request model for profile settings updates."""
    full_name: Optional[str] = None


class TokenResponse(BaseModel):
    """JWT access token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserPublic


class FileMetrics(BaseModel):
    """Metrics for a single file."""
    file_path: str
    file_type: FileType
    file_hash: str
    file_size: int
    lines_of_code: int = 0
    comment_lines: int = 0
    blank_lines: int = 0
    docstring_coverage: float = 0.0
    cyclomatic_complexity: int = 0
    cognitive_complexity: int = 0
    maintainability_index: float = 0.0
    todo_count: int = 0
    fixme_count: int = 0
    has_tests: bool = False
    test_coverage: Optional[float] = None
    dependencies: List[str] = Field(default_factory=list)
    functions: int = 0
    classes: int = 0
    methods: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FolderStatistics(BaseModel):
    """Statistics for a folder/directory."""
    folder_path: str
    total_files: int = 0
    total_lines: int = 0
    total_size: int = 0
    file_types: Dict[str, int] = Field(default_factory=dict)
    avg_complexity: float = 0.0


class CodeComplexityMetrics(BaseModel):
    """Code complexity metrics."""
    avg_cyclomatic_complexity: float = 0.0
    max_cyclomatic_complexity: int = 0
    avg_cognitive_complexity: float = 0.0
    max_cognitive_complexity: int = 0
    avg_maintainability_index: float = 0.0


class TestMetrics(BaseModel):
    """Test coverage and quality metrics."""
    total_test_files: int = 0
    test_coverage_percentage: float = 0.0
    tests_per_module: float = 0.0


class DuplicateFile(BaseModel):
    """Duplicate file information."""
    file_hash: str
    file_paths: List[str]
    file_size: int


class DependencyInfo(BaseModel):
    """Dependency analysis information."""
    package_name: str
    version: Optional[str] = None
    usage_count: int = 0
    files: List[str] = Field(default_factory=list)


class ScanMetrics(BaseModel):
    """Aggregated metrics for a complete scan."""
    scan_id: str
    repository_path: str
    
    # File statistics
    total_files: int = 0
    total_lines_of_code: int = 0
    total_comment_lines: int = 0
    total_blank_lines: int = 0
    total_size: int = 0
    
    # File type distribution
    file_types: Dict[str, int] = Field(default_factory=dict)
    
    # Folder statistics
    folder_statistics: List[FolderStatistics] = Field(default_factory=list)
    
    # Code quality
    complexity_metrics: CodeComplexityMetrics = Field(default_factory=CodeComplexityMetrics)
    docstring_coverage: float = 0.0
    
    # Issues
    todo_count: int = 0
    fixme_count: int = 0
    
    # Testing
    test_metrics: TestMetrics = Field(default_factory=TestMetrics)
    
    # Dependencies
    dependencies: List[DependencyInfo] = Field(default_factory=list)
    
    # Duplicates
    duplicate_files: List[DuplicateFile] = Field(default_factory=list)
    
    # Dead code indicators
    unused_imports: int = 0
    unused_variables: int = 0
    
    # Timing
    scan_duration: float = 0.0
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Scan(BaseModel):
    """Scan entity representing a repository scan."""
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: Optional[str] = None
    saved_repository_id: Optional[str] = None
    repository_path: str
    branch: str = "main"
    status: ScanStatus = ScanStatus.QUEUED
    incremental: bool = False
    
    # Progress tracking
    progress: float = 0.0
    files_processed: int = 0
    files_total: int = 0
    current_file: Optional[str] = None
    
    # Results
    metrics: Optional[ScanMetrics] = None
    
    # Error handling
    error_message: Optional[str] = None
    retry_count: int = 0
    share_token: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    model_config = {
        "populate_by_name": True,
        "json_encoders": {
            datetime: lambda v: v.isoformat()
        }
    }


class ScanResponse(BaseModel):
    """Response model for scan operations."""
    scan_id: str
    job_id: str
    status: ScanStatus
    message: str


class ScanProgress(BaseModel):
    """Real-time scan progress update."""
    scan_id: str
    status: ScanStatus
    progress: float
    files_processed: int
    files_total: int
    current_file: Optional[str] = None
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HealthCheck(BaseModel):
    """Health check response."""
    status: str
    version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: Dict[str, str] = Field(default_factory=dict)
