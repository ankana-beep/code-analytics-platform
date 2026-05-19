"""
Example Python client for Code Analytics Platform API.
Demonstrates how to use the API programmatically.
"""
import requests
import time
import json
from typing import Optional, Dict


class CodeAnalyticsClient:
    """Python client for Code Analytics Platform API."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api/v1"
    
    def create_scan(
        self,
        repository_path: str,
        branch: str = "main",
        incremental: bool = False
    ) -> Dict:
        """
        Create a new repository scan.
        
        Args:
            repository_path: Path to repository
            branch: Git branch to scan
            incremental: Enable incremental scanning
            
        Returns:
            Response with scan_id and job_id
        """
        response = requests.post(
            f"{self.api_url}/scans",
            json={
                "repository_path": repository_path,
                "branch": branch,
                "incremental": incremental
            }
        )
        response.raise_for_status()
        return response.json()
    
    def get_scan(self, scan_id: str) -> Dict:
        """
        Get scan details.
        
        Args:
            scan_id: Scan identifier
            
        Returns:
            Scan details
        """
        response = requests.get(f"{self.api_url}/scans/{scan_id}")
        response.raise_for_status()
        return response.json()
    
    def get_scan_status(self, scan_id: str) -> Dict:
        """
        Get scan status and progress.
        
        Args:
            scan_id: Scan identifier
            
        Returns:
            Status and progress information
        """
        response = requests.get(f"{self.api_url}/scans/{scan_id}/status")
        response.raise_for_status()
        return response.json()
    
    def list_scans(
        self,
        skip: int = 0,
        limit: int = 10,
        repository_path: Optional[str] = None,
        status: Optional[str] = None
    ) -> list:
        """
        List scans with pagination and filtering.
        
        Args:
            skip: Number of records to skip
            limit: Maximum records to return
            repository_path: Filter by repository
            status: Filter by status
            
        Returns:
            List of scans
        """
        params = {"skip": skip, "limit": limit}
        
        if repository_path:
            params["repository_path"] = repository_path
        
        if status:
            params["status"] = status
        
        response = requests.get(f"{self.api_url}/scans", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_scan_files(
        self,
        scan_id: str,
        skip: int = 0,
        limit: int = 100
    ) -> list:
        """
        Get file-level metrics for a scan.
        
        Args:
            scan_id: Scan identifier
            skip: Number of records to skip
            limit: Maximum records to return
            
        Returns:
            List of file metrics
        """
        response = requests.get(
            f"{self.api_url}/scans/{scan_id}/files",
            params={"skip": skip, "limit": limit}
        )
        response.raise_for_status()
        return response.json()
    
    def wait_for_scan(
        self,
        scan_id: str,
        timeout: int = 3600,
        poll_interval: int = 5
    ) -> Dict:
        """
        Wait for scan to complete.
        
        Args:
            scan_id: Scan identifier
            timeout: Maximum wait time in seconds
            poll_interval: Polling interval in seconds
            
        Returns:
            Final scan details
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_scan_status(scan_id)
            
            print(f"Status: {status['status']}, Progress: {status['progress']:.1f}%")
            
            if status['status'] in ['completed', 'failed', 'cancelled']:
                return self.get_scan(scan_id)
            
            time.sleep(poll_interval)
        
        raise TimeoutError(f"Scan did not complete within {timeout} seconds")
    
    def health_check(self) -> Dict:
        """Check API health."""
        response = requests.get(f"{self.api_url}/health")
        response.raise_for_status()
        return response.json()


# Example usage
if __name__ == "__main__":
    # Initialize client
    client = CodeAnalyticsClient()
    
    # Check health
    print("Checking API health...")
    health = client.health_check()
    print(f"API Status: {health['status']}")
    print()
    
    # Create a scan
    print("Creating scan...")
    scan_response = client.create_scan(
        repository_path="/repositories/my-project",
        branch="main",
        incremental=False
    )
    
    scan_id = scan_response['scan_id']
    print(f"Scan created: {scan_id}")
    print(f"Job ID: {scan_response['job_id']}")
    print()
    
    # Wait for scan to complete
    print("Waiting for scan to complete...")
    try:
        scan = client.wait_for_scan(scan_id, timeout=600)
        
        print("\nScan completed!")
        print(f"Status: {scan['status']}")
        
        if scan['metrics']:
            metrics = scan['metrics']
            print(f"\nResults:")
            print(f"  Total Files: {metrics['total_files']}")
            print(f"  Lines of Code: {metrics['total_lines_of_code']}")
            print(f"  Comment Lines: {metrics['total_comment_lines']}")
            print(f"  Docstring Coverage: {metrics['docstring_coverage']:.1f}%")
            print(f"  TODO Count: {metrics['todo_count']}")
            print(f"  FIXME Count: {metrics['fixme_count']}")
            
            if metrics['complexity_metrics']:
                complexity = metrics['complexity_metrics']
                print(f"  Avg Cyclomatic Complexity: {complexity['avg_cyclomatic_complexity']:.1f}")
                print(f"  Max Cyclomatic Complexity: {complexity['max_cyclomatic_complexity']}")
        
        # Get file metrics
        print("\nFetching file metrics...")
        files = client.get_scan_files(scan_id, limit=5)
        
        print(f"\nTop 5 files:")
        for file in files:
            print(f"  - {file['file_path']}")
            print(f"    LOC: {file['lines_of_code']}, Complexity: {file['cyclomatic_complexity']}")
    
    except TimeoutError as e:
        print(f"Error: {e}")
    except Exception as e:
        print(f"Error: {e}")
