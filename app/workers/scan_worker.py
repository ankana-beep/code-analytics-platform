"""
Background worker for processing scan jobs from Redis queue.
Implements worker pool with graceful shutdown and retry logic.
"""
import asyncio
import signal
import sys
from typing import Optional
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from app.core.config import settings
from app.core.logging import logger
from app.core.database import mongodb_manager
from app.core.redis import redis_manager
from app.core.metrics import metrics
from app.repositories.scan_repository import ScanRepository
from app.services.scanner_service import ScannerService
from app.domain.models import ScanStatus


class ScanWorker:
    """
    Background worker that processes scan jobs from the Redis queue.
    
    Features:
    - Graceful shutdown handling
    - Automatic retry with exponential backoff
    - Concurrency control
    - Health monitoring
    """
    
    def __init__(self, worker_id: int):
        self.worker_id = worker_id
        self.running = False
        self.current_job_id: Optional[str] = None
        self.shutdown_event = asyncio.Event()
    
    async def start(self):
        """Start the worker and begin processing jobs."""
        logger.info(f"Worker {self.worker_id} starting")
        
        # Connect to databases
        await mongodb_manager.connect()
        await redis_manager.connect()
        
        # Initialize services
        repository = ScanRepository(mongodb_manager.get_database())
        scanner_service = ScannerService(repository, redis_manager)
        
        self.running = True
        metrics.update_active_workers(1)
        
        try:
            while self.running:
                # Check for shutdown signal
                if self.shutdown_event.is_set():
                    logger.info(f"Worker {self.worker_id} shutting down gracefully")
                    break
                
                # Dequeue job with timeout
                job = await redis_manager.dequeue_job(timeout=5)
                
                if job:
                    self.current_job_id = job.get('job_id')
                    await self._process_job(job, scanner_service, repository)
                    self.current_job_id = None
                
                # Update queue metrics
                queue_length = await redis_manager.get_queue_length()
                metrics.update_queue_length(queue_length)
        
        except Exception as e:
            logger.error(f"Worker {self.worker_id} crashed: {str(e)}", exc_info=True)
        
        finally:
            self.running = False
            metrics.update_active_workers(-1)
            await self._cleanup()
            logger.info(f"Worker {self.worker_id} stopped")
    
    @retry(
        stop=stop_after_attempt(settings.worker_max_retries),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(Exception)
    )
    async def _process_job(
        self,
        job: dict,
        scanner_service: ScannerService,
        repository: ScanRepository
    ):
        """
        Process a single scan job with retry logic.
        
        Args:
            job: Job data from queue
            scanner_service: Scanner service instance
            repository: Scan repository instance
        """
        job_id = job.get('job_id')
        scan_id = job.get('scan_id')
        repository_path = job.get('repository_path')
        branch = job.get('branch', 'main')
        incremental = job.get('incremental', False)
        
        logger.info(
            f"Worker {self.worker_id} processing job",
            extra={
                "job_id": job_id,
                "scan_id": scan_id,
                "repository": repository_path,
                "branch": branch,
                "incremental": incremental
            }
        )
        
        import time
        start_time = time.time()
        
        try:
            # Update job status
            await redis_manager.set_job_status(job_id, "processing")
            
            # Execute scan
            success = await scanner_service.scan_repository(scan_id, repository_path, branch, incremental)
            
            # Update job status
            if success:
                await redis_manager.set_job_status(job_id, "completed", {
                    "scan_id": scan_id,
                    "duration": time.time() - start_time
                })
                
                duration = time.time() - start_time
                metrics.record_job("completed", duration)
                metrics.record_worker_task(str(self.worker_id))
                
                logger.info(
                    f"Worker {self.worker_id} completed job",
                    extra={
                        "job_id": job_id,
                        "scan_id": scan_id,
                        "duration": duration
                    }
                )
            else:
                await redis_manager.set_job_status(job_id, "failed", {
                    "error": "Scan execution failed"
                })
                
                metrics.record_job("failed", time.time() - start_time)
                metrics.record_error("scan_execution_failed")
        
        except Exception as e:
            logger.error(
                f"Worker {self.worker_id} job failed: {str(e)}",
                extra={"job_id": job_id, "scan_id": scan_id},
                exc_info=True
            )
            
            await redis_manager.set_job_status(job_id, "failed", {
                "error": str(e)
            })
            
            metrics.record_job("failed", time.time() - start_time)
            metrics.record_error("job_processing_error")
            
            raise
    
    async def shutdown(self):
        """Initiate graceful shutdown."""
        logger.info(f"Worker {self.worker_id} received shutdown signal")
        self.shutdown_event.set()
        self.running = False
    
    async def _cleanup(self):
        """Cleanup resources on shutdown."""
        try:
            await mongodb_manager.disconnect()
            await redis_manager.disconnect()
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")


class WorkerPool:
    """
    Pool of worker processes for parallel job processing.
    
    Manages multiple workers and handles graceful shutdown.
    """
    
    def __init__(self, pool_size: int = None):
        self.pool_size = pool_size or settings.worker_pool_size
        self.workers: list[ScanWorker] = []
        self.tasks: list[asyncio.Task] = []
    
    async def start(self):
        """Start all workers in the pool."""
        logger.info(f"Starting worker pool with {self.pool_size} workers")
        
        # Create workers
        self.workers = [ScanWorker(i) for i in range(self.pool_size)]
        
        # Start worker tasks
        self.tasks = [
            asyncio.create_task(worker.start())
            for worker in self.workers
        ]
        
        # Setup signal handlers for graceful shutdown
        self._setup_signal_handlers()
        
        # Wait for all workers
        await asyncio.gather(*self.tasks, return_exceptions=True)
        
        logger.info("Worker pool shut down")
    
    def _setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown."""
        loop = asyncio.get_event_loop()
        
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig,
                lambda s=sig: asyncio.create_task(self._shutdown(s))
            )
    
    async def _shutdown(self, sig):
        """Handle shutdown signal."""
        logger.info(f"Received signal {sig.name}, initiating graceful shutdown")
        
        # Signal all workers to shutdown
        shutdown_tasks = [worker.shutdown() for worker in self.workers]
        await asyncio.gather(*shutdown_tasks, return_exceptions=True)
        
        # Wait for workers to finish current jobs (with timeout)
        try:
            await asyncio.wait_for(
                asyncio.gather(*self.tasks, return_exceptions=True),
                timeout=30.0
            )
        except asyncio.TimeoutError:
            logger.warning("Worker shutdown timeout, forcing exit")


async def main():
    """Main entry point for worker process."""
    logger.info("Starting Code Analytics Worker")
    
    pool = WorkerPool()
    
    try:
        await pool.start()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Worker pool error: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
