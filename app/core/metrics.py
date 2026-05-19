"""
Prometheus metrics configuration and custom collectors.
Provides observability for application performance and business metrics.
"""
from prometheus_client import Counter, Histogram, Gauge, Info
from prometheus_client import REGISTRY, CollectorRegistry
from typing import Dict, Any

from app.core.config import settings


# Application info
app_info = Info('code_analytics_app', 'Application information')
app_info.info({
    'version': settings.app_version,
    'name': settings.app_name
})

# Request metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint']
)

# Scan metrics
scans_total = Counter(
    'scans_total',
    'Total scans initiated',
    ['status']
)

scan_duration_seconds = Histogram(
    'scan_duration_seconds',
    'Scan duration in seconds',
    ['repository']
)

files_scanned_total = Counter(
    'files_scanned_total',
    'Total files scanned'
)

scan_errors_total = Counter(
    'scan_errors_total',
    'Total scan errors',
    ['error_type']
)

# Queue metrics
queue_length = Gauge(
    'queue_length',
    'Current queue length'
)

jobs_processed_total = Counter(
    'jobs_processed_total',
    'Total jobs processed',
    ['status']
)

job_processing_duration_seconds = Histogram(
    'job_processing_duration_seconds',
    'Job processing duration'
)

# Worker metrics
active_workers = Gauge(
    'active_workers',
    'Number of active workers'
)

worker_tasks_total = Counter(
    'worker_tasks_total',
    'Total tasks processed by workers',
    ['worker_id']
)

# Database metrics
db_operations_total = Counter(
    'db_operations_total',
    'Total database operations',
    ['operation', 'collection']
)

db_operation_duration_seconds = Histogram(
    'db_operation_duration_seconds',
    'Database operation duration',
    ['operation', 'collection']
)

# Cache metrics
cache_hits_total = Counter(
    'cache_hits_total',
    'Total cache hits'
)

cache_misses_total = Counter(
    'cache_misses_total',
    'Total cache misses'
)

# Code metrics (business metrics)
code_lines_total = Gauge(
    'code_lines_total',
    'Total lines of code across all repositories'
)

code_complexity_avg = Gauge(
    'code_complexity_avg',
    'Average code complexity'
)

test_coverage_percentage = Gauge(
    'test_coverage_percentage',
    'Test coverage percentage',
    ['repository']
)


class MetricsCollector:
    """Helper class for collecting and exporting metrics."""
    
    @staticmethod
    def record_request(method: str, endpoint: str, status: int, duration: float):
        """Record HTTP request metrics."""
        if settings.enable_metrics:
            http_requests_total.labels(method=method, endpoint=endpoint, status=status).inc()
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
    
    @staticmethod
    def record_scan(status: str, duration: float, repository: str, files_count: int):
        """Record scan metrics."""
        if settings.enable_metrics:
            scans_total.labels(status=status).inc()
            scan_duration_seconds.labels(repository=repository).observe(duration)
            files_scanned_total.inc(files_count)
    
    @staticmethod
    def record_error(error_type: str):
        """Record error metrics."""
        if settings.enable_metrics:
            scan_errors_total.labels(error_type=error_type).inc()
    
    @staticmethod
    def update_queue_length(length: int):
        """Update queue length gauge."""
        if settings.enable_metrics:
            queue_length.set(length)
    
    @staticmethod
    def record_job(status: str, duration: float):
        """Record job processing metrics."""
        if settings.enable_metrics:
            jobs_processed_total.labels(status=status).inc()
            job_processing_duration_seconds.observe(duration)
    
    @staticmethod
    def update_active_workers(count: int):
        """Update active workers gauge."""
        if settings.enable_metrics:
            active_workers.set(count)

    @staticmethod
    def record_worker_task(worker_id: str):
        """Record a task completed by a worker."""
        if settings.enable_metrics:
            worker_tasks_total.labels(worker_id=worker_id).inc()
    
    @staticmethod
    def record_db_operation(operation: str, collection: str, duration: float):
        """Record database operation metrics."""
        if settings.enable_metrics:
            db_operations_total.labels(operation=operation, collection=collection).inc()
            db_operation_duration_seconds.labels(operation=operation, collection=collection).observe(duration)
    
    @staticmethod
    def record_cache_hit():
        """Record cache hit."""
        if settings.enable_metrics:
            cache_hits_total.inc()
    
    @staticmethod
    def record_cache_miss():
        """Record cache miss."""
        if settings.enable_metrics:
            cache_misses_total.inc()


# Global metrics collector instance
metrics = MetricsCollector()
